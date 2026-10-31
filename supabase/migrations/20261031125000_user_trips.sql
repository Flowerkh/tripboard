-- Applied to the Supabase project "tripboard" (ref ubmovsguvpqpdguwivst) on 2026-10-31.
-- Each signed-in user's trips, so the same trips show up on every device.
-- One row per trip; data holds the trip and its items. Deleting a trip leaves a
-- tombstone (deleted = true) so other devices also remove it.
create table public.user_trips (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint user_trips_data_size check (octet_length(data::text) <= 500000)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end; $$;

create trigger user_trips_touch before update on public.user_trips
for each row execute function public.touch_updated_at();

alter table public.user_trips enable row level security;
create policy "own trips: read" on public.user_trips
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own trips: add" on public.user_trips
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own trips: change" on public.user_trips
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own trips: remove" on public.user_trips
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.user_trips from anon, public;
grant select, insert, update, delete on table public.user_trips to authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
