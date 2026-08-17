-- Phase 2: 웹 대응 스키마 확장
-- 1) users: auth_user_id 추가 + telegram_chat_id nullable
-- 2) link_codes 테이블 신설
-- 3) RLS 정책 추가
-- 4) auth.users 가입 트리거

alter table users alter column telegram_chat_id drop not null;
alter table users add column if not exists auth_user_id uuid unique;

create table if not exists link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  code text unique not null,
  channel text not null default 'telegram',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table link_codes enable row level security;

-- topics: 카탈로그 모델
drop policy if exists "topics_select_all" on topics;
create policy "topics_select_all" on topics for select to authenticated using (true);
drop policy if exists "topics_insert_all" on topics;
create policy "topics_insert_all" on topics for insert to authenticated with check (true);

-- briefings / articles: 카탈로그 모델
drop policy if exists "briefings_select_all" on briefings;
create policy "briefings_select_all" on briefings for select to authenticated using (true);
drop policy if exists "articles_select_all" on articles;
create policy "articles_select_all" on articles for select to authenticated using (true);

-- users: 본인 행만
drop policy if exists "users_select_own" on users;
create policy "users_select_own" on users for select to authenticated using (auth_user_id = auth.uid());
drop policy if exists "users_update_own" on users;
create policy "users_update_own" on users for update to authenticated using (auth_user_id = auth.uid());

-- subscriptions: 본인 행만
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

-- 신규 가입 시 public.users 행 자동 생성
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
