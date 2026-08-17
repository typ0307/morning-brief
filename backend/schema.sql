-- ==========================================================
-- 모닝브리프 최종 스키마 (fresh install)
-- Phase 1(B8) + Phase 2(웹 대응) 반영
-- ==========================================================

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id text unique,
  auth_user_id uuid unique,
  created_at timestamptz not null default now()
);

create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  keyword text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, topic_id)
);

create table if not exists briefings (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id) on delete cascade,
  brief_date date not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  unique (topic_id, brief_date)
);

create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id) on delete cascade,
  title text,
  url text not null,
  body text,
  snippet text,
  published_at timestamptz,
  briefing_id uuid references briefings(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (topic_id, url)
);

create table if not exists deliveries (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references briefings(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null,
  sent_at timestamptz,
  unique (briefing_id, user_id)
);

create table if not exists link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  code text unique not null,
  channel text not null default 'telegram',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_articles_topic_briefing on articles(topic_id, briefing_id);
create index if not exists idx_articles_published on articles(published_at desc);
create index if not exists idx_deliveries_briefing on deliveries(briefing_id);

alter table users enable row level security;
alter table topics enable row level security;
alter table subscriptions enable row level security;
alter table briefings enable row level security;
alter table articles enable row level security;
alter table deliveries enable row level security;
alter table link_codes enable row level security;

-- ==========================================================
-- RLS 정책
-- ==========================================================

-- topics: 카탈로그 모델 (인증 사용자 모두 열람 + 키워드 신규 생성)
drop policy if exists "topics_select_all" on topics;
create policy "topics_select_all" on topics for select to authenticated using (true);
drop policy if exists "topics_insert_all" on topics;
create policy "topics_insert_all" on topics for insert to authenticated with check (true);

-- briefings: 카탈로그 모델 (인증 사용자 모두 열람)
drop policy if exists "briefings_select_all" on briefings;
create policy "briefings_select_all" on briefings for select to authenticated using (true);

-- articles: 카탈로그 모델 (인증 사용자 모두 열람)
drop policy if exists "articles_select_all" on articles;
create policy "articles_select_all" on articles for select to authenticated using (true);

-- users: 본인 행만 SELECT/UPDATE (INSERT는 auth.users 트리거가 담당)
drop policy if exists "users_select_own" on users;
create policy "users_select_own" on users for select to authenticated using (auth_user_id = auth.uid());
drop policy if exists "users_update_own" on users;
create policy "users_update_own" on users for update to authenticated using (auth_user_id = auth.uid());

-- subscriptions: 본인 행만 SELECT/INSERT/DELETE
drop policy if exists "subscriptions_select_own" on subscriptions;
create policy "subscriptions_select_own" on subscriptions for select to authenticated
  using (user_id in (select id from users where auth_user_id = auth.uid()));
drop policy if exists "subscriptions_insert_own" on subscriptions;
create policy "subscriptions_insert_own" on subscriptions for insert to authenticated
  with check (user_id in (select id from users where auth_user_id = auth.uid()));
drop policy if exists "subscriptions_delete_own" on subscriptions;
create policy "subscriptions_delete_own" on subscriptions for delete to authenticated
  using (user_id in (select id from users where auth_user_id = auth.uid()));

-- link_codes: 본인 것만 SELECT/INSERT (UPDATE/DELETE는 service_role 전용)
drop policy if exists "link_codes_select_own" on link_codes;
create policy "link_codes_select_own" on link_codes for select to authenticated
  using (user_id in (select id from users where auth_user_id = auth.uid()));
drop policy if exists "link_codes_insert_own" on link_codes;
create policy "link_codes_insert_own" on link_codes for insert to authenticated
  with check (user_id in (select id from users where auth_user_id = auth.uid()));

-- deliveries: 정책 없음 (service_role 전용 유지)

-- ==========================================================
-- 신규 가입(auth.users) 시 public.users 행 자동 생성
-- ==========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (auth_user_id)
  values (new.id)
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
