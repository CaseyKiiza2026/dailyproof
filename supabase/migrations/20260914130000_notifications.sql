create table public.notification_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false, daily_time time,
 friend_activity boolean not null default false, nudges boolean not null default true,
 push_alias text not null default (gen_random_uuid()::text||gen_random_uuid()::text) unique
);
alter table public.notification_settings enable row level security;
create policy notification_settings_owner on public.notification_settings for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select on public.notification_settings to authenticated;
grant insert(user_id,enabled,daily_time,friend_activity,nudges),update(enabled,daily_time,friend_activity,nudges) on public.notification_settings to authenticated;

create table public.reminders (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid, habit_id uuid references public.habits(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 200), message text not null default '' check(length(message)<=2000),
 scheduled_at timestamptz not null, channel text not null default 'push' check(channel in('push','email','sms')),
 only_if_incomplete boolean not null default false,
 status text not null default 'pending' check(status in('pending','queued','sent','failed','skipped','cancelled')),
 sent_at timestamptz, created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(task_id,user_id) references public.tasks(id,user_id) on delete cascade,
 check(num_nonnulls(task_id,habit_id)<=1)
);
create index reminders_due on public.reminders(scheduled_at) where status='pending';
create index reminders_owner on public.reminders(user_id,scheduled_at);
alter table public.reminders enable row level security;
create policy reminders_read on public.reminders for select to authenticated using(user_id=(select auth.uid()));
create policy reminders_insert on public.reminders for insert to authenticated with check(user_id=(select auth.uid()) and status='pending' and sent_at is null and channel='push');
create policy reminders_update on public.reminders for update to authenticated using(user_id=(select auth.uid()) and status='pending') with check(user_id=(select auth.uid()) and status in('pending','cancelled') and sent_at is null and channel='push');
grant select,insert,update on public.reminders to authenticated;
create trigger reminders_stamp before update on public.reminders for each row execute function public.stamp_owned_record();
create function public.validate_reminder() returns trigger language plpgsql set search_path='' as $$
begin
 if new.habit_id is not null and not exists(select 1 from public.habits where id=new.habit_id and user_id=new.user_id) then raise exception 'Habit not found' using errcode='42501'; end if;
 if tg_op='INSERT' and new.scheduled_at<=now() then raise exception 'Reminder must be in the future'; end if;
 return new;
end $$;
create trigger reminders_validate before insert or update on public.reminders for each row execute function public.validate_reminder();

create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 type text not null,title text not null,body text not null,read_at timestamptz,created_at timestamptz not null default now(),metadata jsonb not null default '{}',
 source_key text not null unique, reminder_id uuid references public.reminders(id) on delete set null,
 push_status text not null default 'pending' check(push_status in('pending','sending','sent','failed','skipped')),
 attempts integer not null default 0, lease_until timestamptz,next_attempt timestamptz not null default now(),sent_at timestamptz,error text
);
create index notifications_history on public.notifications(user_id,created_at desc);
create index notifications_delivery on public.notifications(next_attempt) where push_status in('pending','sending');
alter table public.notifications enable row level security;
create policy notifications_read on public.notifications for select to authenticated using(user_id=(select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant all on public.notification_settings,public.reminders,public.notifications to service_role;

create function public.enqueue_due_notifications() returns void language plpgsql security definer set search_path='' as $$
declare r public.reminders; s record; day_key date; due_time timestamptz;
begin
 for r in select * from public.reminders where status='pending' and scheduled_at<=now() order by scheduled_at limit 100 for update skip locked loop
  if r.only_if_incomplete and ((r.task_id is not null and exists(select 1 from public.tasks where id=r.task_id and status<>'pending')) or
    (r.habit_id is not null and exists(select 1 from public.habit_logs where habit_id=r.habit_id and log_date=(r.scheduled_at at time zone public.user_timezone(r.user_id))::date and status='complete'))) then
   update public.reminders set status='skipped' where id=r.id;
  else
   insert into public.notifications(user_id,type,title,body,source_key,reminder_id) values(r.user_id,'scheduled_reminder',r.title,r.message,'reminder:'||r.id,r.id) on conflict(source_key) do nothing;
   update public.reminders set status='queued' where id=r.id;
  end if;
 end loop;
 for s in select ns.*,p.timezone from public.notification_settings ns join public.user_preferences p using(user_id) where ns.enabled and ns.daily_time is not null loop
  day_key:=(now() at time zone s.timezone)::date;due_time:=(day_key+s.daily_time) at time zone s.timezone;
  if due_time<=now() then insert into public.notifications(user_id,type,title,body,source_key) values(s.user_id,'dailyproof_reminder','DailyProof check-in','Your daily check-in is ready.','daily:'||s.user_id||':'||day_key) on conflict(source_key) do nothing; end if;
 end loop;
 insert into public.notifications(user_id,type,title,body,source_key)
 select t.user_id,'task_due_soon','Task due soon','Open DailyProof to review your task.','task:'||t.id||':'||t.due_at
 from public.tasks t join public.notification_settings s on s.user_id=t.user_id and s.enabled where t.status='pending' and t.due_at>now() and t.due_at<=now()+interval '15 minutes' on conflict(source_key) do nothing;
end $$;

create function public.claim_push_notifications() returns setof public.notifications language plpgsql security definer set search_path='' as $$
begin
 with expired as (
  update public.notifications set push_status='failed',lease_until=null,error='Delivery retry window expired'
  where push_status in('pending','sending') and
   (created_at<now()-interval '24 hours' or (attempts>=6 and (push_status='pending' or lease_until<now())))
  returning reminder_id
 ) update public.reminders set status='failed' where id in(select reminder_id from expired);
 return query update public.notifications n set push_status='sending',lease_until=now()+interval '5 minutes',attempts=attempts+1
 where n.id in(select id from public.notifications where ((push_status='pending' and next_attempt<=now()) or (push_status='sending' and lease_until<now())) and attempts<6 order by created_at limit 30 for update skip locked) returning n.*;
end $$;

create function public.finish_push_notification(p_id uuid,p_attempt integer,p_status text,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
declare n public.notifications;
begin
 if p_status not in('sent','failed','skipped') then raise exception 'Invalid delivery result'; end if;
 select * into n from public.notifications where id=p_id and attempts=p_attempt and push_status='sending' for update;
 if not found then return; end if;
 update public.notifications set push_status=case when p_status='failed' and attempts<6 then 'pending' else p_status end,
  error=left(p_error,500),lease_until=null,next_attempt=now()+interval '1 minute'*power(2,attempts),sent_at=case when p_status='sent' then now() else null end where id=p_id;
 update public.reminders set status=case when p_status='failed' and n.attempts<6 then 'queued' else p_status end,sent_at=case when p_status='sent' then now() else null end where id=n.reminder_id;
end $$;

create function public.notify_nudge() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.from_user_id::text||new.to_user_id::text,1));
 if exists(select 1 from public.nudges where from_user_id=new.from_user_id and to_user_id=new.to_user_id and id<>new.id and created_at>now()-interval '1 hour') then raise exception 'Please wait an hour before nudging this friend again'; end if;
 if coalesce((select nudges from public.notification_settings where user_id=new.to_user_id),true) then
  insert into public.notifications(user_id,type,title,body,source_key,metadata) values(new.to_user_id,'nudge','A friend sent a nudge','Open DailyProof for your check-in.','nudge:'||new.id,jsonb_build_object('sender_id',new.from_user_id));
 end if;return new;
end $$;
create trigger nudge_notification after insert on public.nudges for each row execute function public.notify_nudge();

create function public.notify_friend_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'complete' then return new; end if;
 if tg_op='UPDATE' and old.status='complete' then return new; end if;
 insert into public.notifications(user_id,type,title,body,source_key,metadata)
 select s.user_id,'friend_activity','A friend posted DailyProof','Visit Friends to see their summary.','friend:'||s.user_id||':'||new.user_id||':'||new.log_date,jsonb_build_object('sender_id',new.user_id)
 from public.notification_settings s where s.friend_activity and exists(select 1 from public.friendships f where f.status='accepted' and ((f.requester_id=new.user_id and f.addressee_id=s.user_id) or (f.addressee_id=new.user_id and f.requester_id=s.user_id))) on conflict(source_key) do nothing;
 return new;
end $$;
create trigger habit_friend_notification after insert or update on public.habit_logs for each row execute function public.notify_friend_activity();
revoke all on function public.enqueue_due_notifications(),public.claim_push_notifications(),public.finish_push_notification(uuid,integer,text,text),public.notify_nudge(),public.notify_friend_activity() from public,anon,authenticated;
grant execute on function public.enqueue_due_notifications(),public.claim_push_notifications(),public.finish_push_notification(uuid,integer,text,text) to service_role;
