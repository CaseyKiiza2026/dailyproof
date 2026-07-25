-- Denormalize habit_name and logged_late onto feed_events at event-creation
-- time. Necessary because habits/habit_logs RLS restricts reads to the row's
-- own owner — a friend's browser has no other way to learn a log event's
-- habit name or late-flag. Snapshotting also means a later habit rename/
-- delete doesn't retroactively change what an old feed entry says.
alter table public.feed_events add column habit_name text;
alter table public.feed_events add column logged_late boolean;

alter table public.feed_events drop constraint feed_events_log_shape;
alter table public.feed_events add constraint feed_events_log_shape check (
  (event_type = 'log' and habit_id is not null and status is not null and tier_name is null and habit_name is not null)
  or
  (event_type = 'milestone' and habit_id is null and status is null and tier_name is not null and habit_name is null and logged_late is null)
);

create or replace function public.handle_habit_log_feed_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_habit_name text;
begin
  if new.status not in ('complete', 'missed') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select name into v_habit_name from public.habits where id = new.habit_id;

  insert into public.feed_events (user_id, event_type, habit_id, status, habit_name, logged_late)
  values (new.user_id, 'log', new.habit_id, new.status, v_habit_name, new.logged_late);

  perform public.check_and_insert_milestone(new.user_id);

  return new;
end;
$$;
