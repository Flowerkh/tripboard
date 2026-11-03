-- Member management for the admin page: an admin note, a ban reason, ending a member's sessions,
-- and cleaning up what a deleted account leaves behind. Bans and deletes themselves run in the
-- "account" server function through the Auth admin API; it calls the two internal functions below.

alter table public.member_limits
  add column if not exists note text not null default '',
  add column if not exists ban_reason text not null default '';

-- the member list now also shows the note, an active ban and how many share links the member has
drop function if exists public.admin_members();
create function public.admin_members()
returns table (
  user_id uuid, name text, avatar text, created_at timestamptz, last_sign_in_at timestamptz,
  trips int, shares int, used_today int, used_month int, cost_month numeric,
  daily int, monthly int, paused boolean, is_admin boolean,
  note text, banned_until timestamptz, ban_reason text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
  select u.id,
         coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', ''), '카카오 사용자'),
         replace(coalesce(u.raw_user_meta_data->>'avatar_url', ''), 'http://', 'https://'),
         u.created_at, u.last_sign_in_at,
         (select count(*)::int from public.user_trips t where t.user_id = u.id and not t.deleted),
         (select count(*)::int from public.user_trips t where t.user_id = u.id and not t.deleted
             and coalesce(t.data->'trip'->'share'->>'id', '') <> ''),
         c.today, c.month,
         (select coalesce(sum(a.cost_usd), 0) from public.ai_usage a
           where a.user_id = u.id and a.at >= (date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')),
         l.daily, l.monthly, coalesce(l.paused, false),
         exists (select 1 from public.admins ad where ad.user_id = u.id),
         coalesce(l.note, ''),
         case when u.banned_until > now() then u.banned_until end,
         case when u.banned_until > now() then coalesce(l.ban_reason, '') else '' end
    from auth.users u
    left join public.member_limits l on l.user_id = u.id
    cross join lateral public.usage_counts(u.id) c
   order by u.created_at;
end; $$;
revoke all on function public.admin_members() from public, anon;
grant execute on function public.admin_members() to authenticated;

-- log a member out everywhere: their refresh tokens go with their sessions
create function public.account_end_sessions(p_user uuid)
returns int
language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end; $$;

-- before an account is deleted: stop its share links and drop the text of its filtered chats.
-- Its trips, limits and admin row go with the account (on delete cascade); its AI usage rows stay
-- without a name (on delete set null) so cost totals stay right.
create function public.account_cleanup(p_user uuid)
returns json
language plpgsql security definer set search_path = ''
as $$
declare n_shares int; n_snippets int;
begin
  delete from public.shared_trips s
   where s.id in (select t.data->'trip'->'share'->>'id' from public.user_trips t where t.user_id = p_user);
  get diagnostics n_shares = row_count;
  update public.ai_usage set snippet = null where user_id = p_user and snippet is not null;
  get diagnostics n_snippets = row_count;
  return json_build_object('shares', n_shares, 'snippets', n_snippets);
end; $$;

revoke all on function public.account_end_sessions(uuid) from public, anon, authenticated;
revoke all on function public.account_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.account_end_sessions(uuid) to service_role;
grant execute on function public.account_cleanup(uuid) to service_role;
