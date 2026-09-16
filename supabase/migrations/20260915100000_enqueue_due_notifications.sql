-- P0-A / R-01: remove PL/pgSQL record/table alias ambiguity without changing
-- reminder selection, skip rules, payloads, source keys or delivery behavior.
-- Replace only this function; CREATE OR REPLACE retains its EXECUTE grants.
create or replace function public.enqueue_due_notifications()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_reminder public.reminders;
  v_setting record;
  v_day_key date;
  v_due_time timestamptz;
begin
  for v_reminder in
    select reminder.* from public.reminders as reminder
    where reminder.status = 'pending' and reminder.scheduled_at <= now()
    order by reminder.scheduled_at limit 100 for update skip locked
  loop
    if v_reminder.only_if_incomplete and (
      (v_reminder.task_id is not null and exists (
        select 1 from public.tasks as task
        where task.id = v_reminder.task_id and task.status <> 'pending'
      )) or
      (v_reminder.habit_id is not null and exists (
        select 1 from public.habit_logs as habit_log
        where habit_log.habit_id = v_reminder.habit_id
          and habit_log.log_date = (v_reminder.scheduled_at at time zone public.user_timezone(v_reminder.user_id))::date
          and habit_log.status = 'complete'
      ))
    ) then
      update public.reminders as reminder set status = 'skipped' where reminder.id = v_reminder.id;
    else
      insert into public.notifications(user_id,type,title,body,source_key,reminder_id)
      values(v_reminder.user_id,'scheduled_reminder',v_reminder.title,v_reminder.message,'reminder:'||v_reminder.id,v_reminder.id)
      on conflict(source_key) do nothing;
      update public.reminders as reminder set status = 'queued' where reminder.id = v_reminder.id;
    end if;
  end loop;

  for v_setting in
    select settings.*,preferences.timezone
    from public.notification_settings as settings
    join public.user_preferences as preferences on preferences.user_id = settings.user_id
    where settings.enabled and settings.daily_time is not null
  loop
    v_day_key := (now() at time zone v_setting.timezone)::date;
    v_due_time := (v_day_key + v_setting.daily_time) at time zone v_setting.timezone;
    if v_due_time <= now() then
      insert into public.notifications(user_id,type,title,body,source_key)
      values(v_setting.user_id,'dailyproof_reminder','DailyProof check-in','Your daily check-in is ready.','daily:'||v_setting.user_id||':'||v_day_key)
      on conflict(source_key) do nothing;
    end if;
  end loop;

  insert into public.notifications(user_id,type,title,body,source_key)
  select task.user_id,'task_due_soon','Task due soon','Open DailyProof to review your task.','task:'||task.id||':'||task.due_at
  from public.tasks as task
  join public.notification_settings as settings on settings.user_id = task.user_id and settings.enabled
  where task.status = 'pending' and task.due_at > now() and task.due_at <= now() + interval '15 minutes'
  on conflict(source_key) do nothing;
end;
$$;
