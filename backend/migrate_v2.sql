-- v2 마이그레이션: 키워드 공용 브리핑 -> 사용자별 맞춤 브리핑
-- 기존 briefings/deliveries는 테스트 데이터라 초기화하고, articles는 유지한다.

drop table if exists deliveries;
drop table if exists briefing_articles;
drop table if exists briefings;
alter table articles drop column if exists briefing_id;

create table if not exists briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  brief_date date not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, brief_date)
);

create table if not exists briefing_articles (
  briefing_id uuid not null references briefings(id) on delete cascade,
  article_id uuid not null references articles(id) on delete cascade,
  primary key (briefing_id, article_id)
);

create table if not exists deliveries (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references briefings(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null,
  sent_at timestamptz,
  unique (briefing_id, user_id)
);

create index if not exists idx_briefings_user_date on briefings(user_id, brief_date);
create index if not exists idx_briefing_articles_article on briefing_articles(article_id);
create index if not exists idx_deliveries_briefing on deliveries(briefing_id);

alter table briefings enable row level security;
alter table briefing_articles enable row level security;
alter table deliveries enable row level security;
