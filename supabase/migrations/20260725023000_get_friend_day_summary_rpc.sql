-- Backs the new grouped Daily-card feed redesign. Adds log_date onto
-- feed_events (needed to know WHICH calendar day a card should summarize —
-- created_at is when the row was inserted, not necessarily the day the log
-- applies to, since the edit window allows logging "yesterday" late), and a
-- new get_friend_day_summary RPC that returns CURRENT state for a given user+
-- day (not raw event history), so rapid same-day toggling of one habit only
-- ever shows as one current status, never duplicate spam. Same self-or-
-- accepted-friend gating pattern as get_friend_streak, and privacy-light on
-- purpose: statuses only, no habit names, for the friend-facing summary.

alter table public.feed_events add column log_date date;

-- Backfill existing 'log' rows from earlier testing (they predate this
-- column, so log_date is null on all of them). Best-effort: match back to
-- habit_logs via habit_id, preferring the most recently updated row for that
-- habit since there's no exact 1:1 correlation once a log has since been
-- overwritten; if the habit_logs row was deleted entirely (e.g. cycled back
-- to "empty" during test cleanup), fall back to the feed_event's own
-- created_at date, which is close enough for stale test data.
update public.feed_events fe
set log_date = coalesce(
  (select hl.log_date from public.habit_logs hl where hl.habit_id = fe.habit_id order by hl.updated_at desc limit 1),
  fe.created_at::date
)
where fe.event_type = 'log' and fe.log_date is null;

alter table public.feed_events drop constraint feed_events_log_shape;
alter table public.feed_events add constraint feed_events_log_shape check (
  (event_type = 'log' and habit_id is not null and status is not null and tier_name is null and habit_name is not null and log_date is not null)
  or
  (event_type = 'milestone' and habit_id is null and status is null and tier_name is not null and habit_name is null and logged_late is null and log_date is null)
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

  insert into public.feed_events (user_id, event_type, habit_id, status, habit_name, logged_late, log_date)
  values (new.user_id, 'log', new.habit_id, new.status, v_habit_name, new.logged_late, new.log_date);

  perform public.check_and_insert_milestone(new.user_id);

  return new;
end;
$$;

-- Returns { complete_count, missed_count, rest_count, vacation_count,
-- empty_count, statuses: [...] } for p_target_user_id's habits on
-- p_target_date, or null if the caller isn't p_target_user_id or an accepted
-- friend of theirs. statuses is ordered by the target's own habit
-- order_index (stable visual order) and always has one entry per active
-- habit ('empty' filled in for unlogged ones) — no habit names or ids, just
-- the status list, for the mini colored-cell row.
create or replace function public.get_friend_day_summary(p_target_user_id uuid, p_target_date date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_authorized boolean;
  v_result jsonb;
begin
  v_authorized := (p_target_user_id = auth.uid()) or exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = auth.uid() and f.addressee_id = p_target_user_id)
        or (f.addressee_id = auth.uid() and f.requester_id = p_target_user_id)
      )
  );

  if not v_authorized then
    return null;
  end if;

  select jsonb_build_object(
    'complete_count', count(*) filter (where hl.status = 'complete'),
    'missed_count', count(*) filter (where hl.status = 'missed'),
    'rest_count', count(*) filter (where hl.status = 'rest'),
    'vacation_count', count(*) filter (where hl.status = 'vacation'),
    'empty_count', count(*) filter (where hl.status is null),
    'statuses', coalesce(jsonb_agg(coalesce(hl.status, 'empty') order by h.order_index), '[]'::jsonb)
  )
  into v_result
  from public.habits h
  left join public.habit_logs hl on hl.habit_id = h.id and hl.log_date = p_target_date
  where h.user_id = p_target_user_id;

  return coalesce(
    v_result,
    jsonb_build_object(
      'complete_count', 0, 'missed_count', 0, 'rest_count', 0, 'vacation_count', 0, 'empty_count', 0, 'statuses', '[]'::jsonb
    )
  );
end;
$$;

grant execute on function public.get_friend_day_summary(uuid, date) to authenticated;
