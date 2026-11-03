-- Admin page + server-side AI for Tripboard.
-- Members never see API keys: the "ai" Edge Function reads them with the server key.
-- Admins manage keys, models, limits and filters; every AI call is logged in ai_usage.

-- ---------- admins ----------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on table public.admins from anon, authenticated, public;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- settings (one row) ----------
create table public.ai_settings (
  id int primary key default 1 check (id = 1),
  default_provider text not null default 'claude',
  daily_limit int not null default 30 check (daily_limit >= 0),
  monthly_limit int not null default 300 check (monthly_limit >= 0),
  budget_usd numeric(10,2) not null default 50,
  filter jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.ai_settings (filter) values ($json${
  "stage1": true,
  "stage2": true,
  "reply": "여행 일정에 관한 것만 도와드릴 수 있어요. 예를 들어 '둘째 날 점심 바꿔줘', '비 오면 실내 위주로 바꿔줘'처럼 말해 주세요.",
  "topics": [
    { "name": "개발·코딩", "on": true, "words": ["코딩", "코드 짜", "코드 작성", "코드 만들", "프로그래밍", "파이썬", "자바스크립트", "타입스크립트", "리액트", "알고리즘", "디버깅", "개발해", "앱 만들어", "웹사이트 만들", "sql", "html", "css"] },
    { "name": "연애·인간관계", "on": true, "words": ["연애", "썸 타", "썸타", "남친", "여친", "남자친구", "여자친구", "헤어졌", "헤어지", "이별", "소개팅", "짝사랑", "재회"] },
    { "name": "숙제·업무 글쓰기", "on": true, "words": ["숙제", "과제", "레포트", "리포트", "논문", "자소서", "자기소개서", "시험 문제", "보고서 써", "이메일 써"] },
    { "name": "투자·돈", "on": true, "words": ["주식", "코인", "비트코인", "투자", "부동산", "대출", "청약"] }
  ],
  "allow": ["여행", "일정", "동선", "코스", "맛집", "식당", "카페", "숙소", "호텔", "게스트하우스", "공항", "비행", "항공", "기차", "ktx", "버스", "지하철", "택시", "렌트", "지도", "길찾기", "관광", "명소", "구경", "산책", "쇼핑", "시장", "점심", "저녁", "아침", "브런치", "야경", "날씨", "비 와", "눈 와", "도착", "출발", "체크인", "체크아웃", "장소", "곳", "어디", "가볼", "가고", "가자", "일차", "첫날", "마지막 날", "오늘", "내일", "미뤄", "당겨", "빼줘", "넣어", "바꿔"]
}$json$::jsonb);
alter table public.ai_settings enable row level security;
revoke all on table public.ai_settings from anon, authenticated, public;
grant select, update on table public.ai_settings to authenticated;
create policy "admin reads settings" on public.ai_settings for select to authenticated using ((select public.is_admin()));
create policy "admin changes settings" on public.ai_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- AI providers and their keys ----------
create table public.ai_providers (
  id text primary key check (id in ('claude', 'openai', 'gemini')),
  label text not null,
  sort int not null,
  enabled boolean not null default true,
  api_key text,                                  -- never granted to clients
  key_last4 text,
  status text not null default 'none' check (status in ('none', 'unchecked', 'ok', 'error')),
  status_note text,
  checked_at timestamptz,
  models jsonb not null default '{}'::jsonb,     -- feature -> model id: plan, chat, geo, recs, ticket
  prices jsonb not null default '{}'::jsonb,     -- model id -> [USD per 1M input, USD per 1M output]
  updated_at timestamptz not null default now()
);
insert into public.ai_providers (id, label, sort, models, prices) values
  ('claude', 'Claude', 1,
   '{"plan":"claude-sonnet-5-5","chat":"claude-haiku-5-5","geo":"claude-sonnet-5-5","recs":"claude-haiku-5-5","ticket":"claude-sonnet-5-5"}',
   '{"claude-opus-5-5":[4,20],"claude-sonnet-5-5":[2,10],"claude-haiku-5-5":[0.1,0.5]}'),
  ('gemini', 'Gemini', 2, '{}', '{}'),
  ('openai', 'OpenAI', 3, '{}', '{}');
alter table public.ai_providers enable row level security;
revoke all on table public.ai_providers from anon, authenticated, public;
grant select (id, label, sort, enabled, key_last4, status, status_note, checked_at, models, prices, updated_at) on table public.ai_providers to authenticated;
grant update (enabled, models, prices) on table public.ai_providers to authenticated;
create policy "admin reads providers" on public.ai_providers for select to authenticated using ((select public.is_admin()));
create policy "admin changes providers" on public.ai_providers for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.admin_set_key(p_provider text, p_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_key is null or length(trim(p_key)) < 12 then raise exception 'key looks too short'; end if;
  update public.ai_providers
     set api_key = trim(p_key), key_last4 = right(trim(p_key), 4), status = 'unchecked', status_note = null, checked_at = null, updated_at = now()
   where id = p_provider;
  if not found then raise exception 'unknown provider'; end if;
end; $$;

create or replace function public.admin_clear_key(p_provider text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.ai_providers set api_key = null, key_last4 = null, status = 'none', status_note = null, checked_at = null, updated_at = now() where id = p_provider;
end; $$;
revoke execute on function public.admin_set_key(text, text) from public, anon;
revoke execute on function public.admin_clear_key(text) from public, anon;
grant execute on function public.admin_set_key(text, text) to authenticated;
grant execute on function public.admin_clear_key(text) to authenticated;

-- ---------- per-member limits ----------
create table public.member_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  daily int check (daily >= 0),        -- null = default
  monthly int check (monthly >= 0),    -- null = default
  paused boolean not null default false,
  reset_at timestamptz,                -- "이번 달 횟수 초기화": count only after this
  updated_at timestamptz not null default now()
);
alter table public.member_limits enable row level security;
revoke all on table public.member_limits from anon, authenticated, public;
grant select, insert, update, delete on table public.member_limits to authenticated;
create policy "admin manages limits" on public.member_limits for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- usage log ----------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  at timestamptz not null default now(),
  request_id text,
  first_round boolean not null default true,
  feature text not null,
  provider text,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read int not null default 0,
  cache_write int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  status text not null check (status in ('ok', 'blocked_app', 'blocked_ai', 'limit', 'error')),
  topic text,
  snippet text
);
create index ai_usage_at_idx on public.ai_usage (at);
create index ai_usage_user_at_idx on public.ai_usage (user_id, at);
alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from anon, authenticated, public;
grant select on table public.ai_usage to authenticated;
create policy "admin reads usage" on public.ai_usage for select to authenticated using ((select public.is_admin()));

-- requests that count toward limits: one per user action (first round), filtered-by-app ones are free
create or replace function public.usage_counts(p_user uuid)
returns table (today int, month int) language sql stable security definer set search_path = '' as $$
  with b as (
    select (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') as day0,
           greatest(date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul',
                    coalesce((select reset_at from public.member_limits where user_id = p_user), '-infinity'::timestamptz)) as month0
  )
  select count(*) filter (where u.at >= b.day0)::int, count(*) filter (where u.at >= b.month0)::int
    from public.ai_usage u, b
   where u.user_id = p_user and u.first_round and u.status in ('ok', 'blocked_ai') and u.at >= least(b.day0, b.month0);
$$;
revoke execute on function public.usage_counts(uuid) from public, anon, authenticated;

-- ---------- what a signed-in member sees ----------
create or replace function public.ai_my_status()
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s public.ai_settings;
  l public.member_limits;
  c record;
begin
  if me is null then raise exception 'sign in first'; end if;
  select * into s from public.ai_settings where id = 1;
  select * into l from public.member_limits where user_id = me;
  select * into c from public.usage_counts(me);
  return json_build_object(
    'providers', (select coalesce(json_agg(json_build_object('id', p.id, 'label', p.label) order by p.sort), '[]'::json)
                    from public.ai_providers p where p.enabled and p.api_key is not null and p.status <> 'error'),
    'default_provider', s.default_provider,
    'daily_limit', coalesce(l.daily, s.daily_limit),
    'monthly_limit', coalesce(l.monthly, s.monthly_limit),
    'used_today', c.today,
    'used_month', c.month,
    'paused', coalesce(l.paused, false),
    'is_admin', public.is_admin()
  );
end; $$;
revoke execute on function public.ai_my_status() from public, anon;
grant execute on function public.ai_my_status() to authenticated;

-- ---------- admin: members ----------
create or replace function public.admin_members()
returns table (
  user_id uuid, name text, avatar text, created_at timestamptz, last_sign_in_at timestamptz,
  trips int, used_today int, used_month int, cost_month numeric, daily int, monthly int, paused boolean, is_admin boolean
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
  select u.id,
         coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', ''), '카카오 사용자'),
         replace(coalesce(u.raw_user_meta_data->>'avatar_url', ''), 'http://', 'https://'),
         u.created_at, u.last_sign_in_at,
         (select count(*)::int from public.user_trips t where t.user_id = u.id and not t.deleted),
         c.today, c.month,
         (select coalesce(sum(a.cost_usd), 0) from public.ai_usage a
           where a.user_id = u.id and a.at >= (date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')),
         l.daily, l.monthly, coalesce(l.paused, false),
         exists (select 1 from public.admins ad where ad.user_id = u.id)
    from auth.users u
    left join public.member_limits l on l.user_id = u.id
    cross join lateral public.usage_counts(u.id) c
   order by u.created_at;
end; $$;
revoke execute on function public.admin_members() from public, anon;
grant execute on function public.admin_members() to authenticated;

create or replace function public.admin_reset_month(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  insert into public.member_limits (user_id, reset_at) values (p_user, now())
  on conflict (user_id) do update set reset_at = now(), updated_at = now();
end; $$;
revoke execute on function public.admin_reset_month(uuid) from public, anon;
grant execute on function public.admin_reset_month(uuid) to authenticated;

-- ---------- the first admin: 김경하 (Kakao) ----------
insert into public.admins (user_id) values ('0f0b1ab2-5c46-4d2d-8ea1-85f45639a3b5') on conflict do nothing;
