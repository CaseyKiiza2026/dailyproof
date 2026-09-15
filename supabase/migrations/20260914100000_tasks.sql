create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 10000),
  due_at timestamptz,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check ((scheduled_start is null and scheduled_end is null) or
    (scheduled_start is not null and scheduled_end is not null and scheduled_end > scheduled_start))
);
create index tasks_owner_due on public.tasks(user_id, due_at);
create index tasks_owner_schedule on public.tasks(user_id, scheduled_start);
alter table public.tasks enable row level security;
create policy tasks_owner on public.tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.tasks to authenticated;

create function public.stamp_owned_record() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.user_id <> old.user_id then
    raise exception 'Record identity cannot change' using errcode = '42501';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;
create trigger tasks_stamp before update on public.tasks for each row execute function public.stamp_owned_record();
