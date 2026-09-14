-- Test-only reconstruction of the baseline described in SPEC.md. The repo
-- does not contain its original migration. Never deploy this fixture.
create role anon;
create role authenticated;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth, public to anon, authenticated;
create publication supabase_realtime;

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique, avatar_url text, bio text, is_public boolean default false,
  created_at timestamptz default now()
);
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text not null, category text not null, is_core boolean default true,
  order_index int default 0, created_at timestamptz default now()
);
create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid references habits on delete cascade,
  user_id uuid references auth.users on delete cascade,
  log_date date not null,
  status text check (status in ('complete', 'missed', 'rest', 'vacation')),
  logged_late boolean default false, created_at timestamptz default now(),
  updated_at timestamptz default now(), unique (habit_id, log_date)
);
alter table profiles enable row level security;
alter table habits enable row level security;
alter table habit_logs enable row level security;
create policy profiles_read on profiles for select using (true);
create policy profiles_update on profiles for update using (id = auth.uid());
create policy habits_owner on habits for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy logs_owner on habit_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
