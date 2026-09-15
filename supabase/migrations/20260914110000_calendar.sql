create table public.commitments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 200), description text not null default '' check(length(description)<=10000),
 start_at timestamptz not null, end_at timestamptz not null check(end_at>start_at),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index commitments_owner_start on public.commitments(user_id,start_at);
alter table public.commitments enable row level security;
create policy commitments_owner on public.commitments for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert,update,delete on public.commitments to authenticated;
create trigger commitments_stamp before update on public.commitments for each row execute function public.stamp_owned_record();
alter table public.habits add column scheduled_time time, add column duration_minutes integer;
alter table public.habits add constraint habit_time_pair check((scheduled_time is null and duration_minutes is null) or (scheduled_time is not null and duration_minutes is not null and duration_minutes between 5 and 720));

-- Serialize scheduling writes for one owner, including concurrent AI/manual requests.
create function public.validate_calendar_block() returns trigger language plpgsql set search_path='' as $$
declare block_start timestamptz; block_end timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
 if tg_table_name='tasks' then
   if new.status='cancelled' or new.scheduled_start is null then return new; end if;
   block_start:=new.scheduled_start; block_end:=new.scheduled_end;
 else block_start:=new.start_at; block_end:=new.end_at;
 end if;
 if exists(select 1 from public.tasks t where t.user_id=new.user_id and t.status<>'cancelled'
   and (tg_table_name<>'tasks' or t.id<>new.id) and t.scheduled_start<block_end and t.scheduled_end>block_start)
 or exists(select 1 from public.commitments c where c.user_id=new.user_id
   and (tg_table_name<>'commitments' or c.id<>new.id) and c.start_at<block_end and c.end_at>block_start) then
   raise exception 'This time overlaps scheduled work or a fixed commitment' using errcode='23514';
 end if;
 return new;
end $$;
create trigger tasks_schedule before insert or update of scheduled_start,scheduled_end,status on public.tasks for each row execute function public.validate_calendar_block();
create trigger commitments_schedule before insert or update of start_at,end_at on public.commitments for each row execute function public.validate_calendar_block();
