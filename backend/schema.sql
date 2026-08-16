create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id text unique not null,
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

create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id) on delete cascade,
  title text,
  url text unique not null,
  body text,
  snippet text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

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

create index if not exists idx_articles_topic on articles(topic_id);
create index if not exists idx_articles_published on articles(published_at desc);
create index if not exists idx_briefings_user_date on briefings(user_id, brief_date);
create index if not exists idx_briefing_articles_article on briefing_articles(article_id);
create index if not exists idx_deliveries_briefing on deliveries(briefing_id);

alter table users enable row level security;
alter table topics enable row level security;
alter table subscriptions enable row level security;
alter table articles enable row level security;
alter table briefings enable row level security;
alter table briefing_articles enable row level security;
alter table deliveries enable row level security;
