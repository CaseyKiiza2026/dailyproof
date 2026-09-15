-- Supabase projects may have default table grants. Explicitly remove them
-- before granting column-scoped mutations for protected settings/history.
revoke all on public.notification_settings,public.notifications,public.ai_plans,public.ai_usage from anon,authenticated;
grant select on public.notification_settings to authenticated;
grant insert(user_id,enabled,daily_time,friend_activity,nudges),update(enabled,daily_time,friend_activity,nudges) on public.notification_settings to authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant select,insert on public.ai_plans to authenticated;
grant update(status) on public.ai_plans to authenticated;

create function public.limit_new_reminders() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,2));
 if (select count(*) from public.reminders where user_id=new.user_id and status in('pending','queued'))>=100 then raise exception 'You can have at most 100 pending reminders'; end if;
 new.created_at:=now();new.updated_at:=now();return new;
end $$;
create trigger reminders_limit before insert on public.reminders for each row execute function public.limit_new_reminders();
create function public.stamp_nudge() returns trigger language plpgsql set search_path='' as $$
begin new.created_at:=now();new.habit_context:=null;return new;end $$;
create trigger nudges_stamp before insert on public.nudges for each row execute function public.stamp_nudge();

-- Include recurring habit times in database scheduling checks. The lock is
-- shared with task and commitment writes, so concurrent scheduling cannot
-- race the check. Ambiguous wall times use PostgreSQL's standard-time rule.
create function public.check_timed_habit_overlap() returns trigger language plpgsql set search_path='' as $$
declare zone text; block_start timestamptz; block_end timestamptz; collision boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
 select timezone into zone from public.user_preferences where user_id=new.user_id;
 if zone is null then raise exception 'Set your timezone before scheduling';end if;
 if tg_table_name='tasks' then
  if new.status='cancelled' or new.scheduled_start is null then return new;end if;
  block_start:=new.scheduled_start;block_end:=new.scheduled_end;
 else block_start:=new.start_at;block_end:=new.end_at;end if;
 if block_end-block_start>interval '366 days' then raise exception 'Calendar blocks may span at most one year';end if;
 select exists(select 1 from public.habits h
 cross join generate_series((block_start at time zone zone)::date-1,(block_end at time zone zone)::date,interval '1 day') d
 where h.user_id=new.user_id and h.scheduled_time is not null and extract(isodow from d)::int=any(h.scheduled_days)
 and (d::date+h.scheduled_time) at time zone zone < block_end
 and ((d::date+h.scheduled_time) at time zone zone)+h.duration_minutes*interval '1 minute'>block_start) into collision;
 if collision then raise exception 'This time overlaps a recurring habit';end if;return new;
end $$;
create trigger tasks_habit_overlap before insert or update of scheduled_start,scheduled_end,status on public.tasks for each row execute function public.check_timed_habit_overlap();
create trigger commitments_habit_overlap before insert or update of start_at,end_at on public.commitments for each row execute function public.check_timed_habit_overlap();

create function public.lock_habit_schedule() returns trigger language plpgsql set search_path='' as $$
begin perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));return new;end $$;
create trigger habits_schedule_lock before insert or update on public.habits for each row execute function public.lock_habit_schedule();

create function public.notify_task_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare day_key date;
begin
 if new.status<>'completed' then return new;end if;
 if tg_op='UPDATE' and old.status='completed' then return new;end if;
 day_key:=public.user_today(new.user_id);
 insert into public.notifications(user_id,type,title,body,source_key,metadata)
 select s.user_id,'friend_activity','A friend posted DailyProof','Visit Friends to see their summary.','friend:'||s.user_id||':'||new.user_id||':'||day_key,jsonb_build_object('sender_id',new.user_id)
 from public.notification_settings s where s.friend_activity and exists(select 1 from public.friendships f where f.status='accepted' and ((f.requester_id=new.user_id and f.addressee_id=s.user_id) or(f.addressee_id=new.user_id and f.requester_id=s.user_id))) on conflict(source_key) do nothing;
 return new;
end $$;
create trigger tasks_friend_notification after insert or update on public.tasks for each row execute function public.notify_task_activity();
revoke all on function public.notify_task_activity() from public,anon,authenticated;
