create table if not exists learner_state (
  user_id text primary key,
  progress jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  today_log jsonb not null default '{}'::jsonb,
  level text not null default 'B1',
  ratings jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
