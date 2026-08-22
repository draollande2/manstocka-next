create table if not exists public.account_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login_id text,
  password text,
  updated_at timestamptz not null default now()
);
grant all on public.account_secrets to service_role;
alter table public.account_secrets enable row level security;