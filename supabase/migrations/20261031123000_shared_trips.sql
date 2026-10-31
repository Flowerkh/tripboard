-- Applied to the Supabase project "tripboard" (ref ubmovsguvpqpdguwivst) on 2026-10-31.
-- Shared trips for Tripboard.
-- The table itself is closed (RLS on, no policies, no grants). Clients only use the
-- functions below: anyone with a link id can read that one trip; only the holder of the
-- secret edit token (kept in the owner's browser) can update or delete it.
create extension if not exists pgcrypto with schema extensions;

create table public.shared_trips (
  id text primary key,
  token_hash bytea not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_trips_data_size check (octet_length(data::text) <= 300000)
);
create index shared_trips_created_at_idx on public.shared_trips (created_at);

alter table public.shared_trips enable row level security;
revoke all on table public.shared_trips from anon, authenticated, public;

create or replace function public.share_create(p_data jsonb)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_id text;
  v_token text;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid data'; end if;
  if octet_length(p_data::text) > 300000 then raise exception 'trip too large'; end if;
  -- crude flood guard for a keyless public endpoint
  if (select count(*) from public.shared_trips where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too many shares, try again shortly';
  end if;
  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  loop
    v_id := translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_');
    begin
      insert into public.shared_trips (id, token_hash, data) values (v_id, extensions.digest(v_token, 'sha256'), p_data);
      exit;
    exception when unique_violation then
      -- id collision: pick another
    end;
  end loop;
  return json_build_object('id', v_id, 'token', v_token);
end; $$;

create or replace function public.share_get(p_id text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('data', s.data, 'updated_at', s.updated_at) from public.shared_trips s where s.id = p_id;
$$;

create or replace function public.share_update(p_id text, p_token text, p_data jsonb)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_at timestamptz;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid data'; end if;
  if octet_length(p_data::text) > 300000 then raise exception 'trip too large'; end if;
  update public.shared_trips set data = p_data, updated_at = now()
   where id = p_id and token_hash = extensions.digest(p_token, 'sha256')
  returning updated_at into v_at;
  if v_at is null then raise exception 'not found or not allowed'; end if;
  return v_at;
end; $$;

create or replace function public.share_delete(p_id text, p_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from public.shared_trips where id = p_id and token_hash = extensions.digest(p_token, 'sha256');
  return found;
end; $$;

revoke execute on function public.share_create(jsonb) from public;
revoke execute on function public.share_get(text) from public;
revoke execute on function public.share_update(text, text, jsonb) from public;
revoke execute on function public.share_delete(text, text) from public;
grant execute on function public.share_create(jsonb) to anon, authenticated;
grant execute on function public.share_get(text) to anon, authenticated;
grant execute on function public.share_update(text, text, jsonb) to anon, authenticated;
grant execute on function public.share_delete(text, text) to anon, authenticated;
