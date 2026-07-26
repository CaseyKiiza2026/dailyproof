-- Habit scheduling: which days of the week a habit applies to, plus the
-- scoring rules that make scheduling actually matter. Day-of-week values are
-- ISO 8601 (1=Monday .. 7=Sunday) throughout, matching Postgres's
-- extract(isodow from date) directly — the client mirrors this exact
-- convention in lib/dates.ts's isoDayOfWeek() so the two never disagree.

alter table public.habits add column scheduled_days int[] not null default '{1,2,3,4,5,6,7}';
alter table public.habits add constraint habits_scheduled_days_valid check (scheduled_days <@ array[1,2,3,4,5,6,7]);

-- ---------------------------------------------------------------------------
-- Scoring change: a day is "successful" when strictly more than 60% of the
-- habits SCHEDULED for that day (not all habits) were completed, among those
-- actually logged (rest/vacation still excluded from the ratio, and an
-- unlogged scheduled habit still counts as "empty", not an automatic miss —
-- same "log row must exist to count" rule as before, just now scoped to the
-- scheduled subset first). Mirrors lib/stats.ts's classifyDate exactly —
-- these two MUST stay in sync by hand, per the comment above the original
-- classify_date definition.
-- ---------------------------------------------------------------------------

create or replace function public.classify_date(p_user_id uuid, p_date date)
returns text
language plpgsql
stable
as $$
declare
  v_complete int;
  v_missed int;
  v_rest int;
  v_vacation int;
  v_dow int;
begin
  v_dow := extract(isodow from p_date)::int;

  select
    count(*) filter (where hl.status = 'complete'),
    count(*) filter (where hl.status = 'missed'),
    count(*) filter (where hl.status = 'rest'),
    count(*) filter (where hl.status = 'vacation')
  into v_complete, v_missed, v_rest, v_vacation
  from public.habit_logs hl
  join public.habits h on h.id = hl.habit_id
  where hl.user_id = p_user_id
    and hl.log_date = p_date
    and v_dow = any(h.scheduled_days);

  if v_complete + v_missed > 0 then
    if v_complete::numeric / (v_complete + v_missed) > 0.6 then
      return 'success';
    else
      return 'fail';
    end if;
  elsif v_vacation > 0 then
    return 'vacation';
  elsif v_rest > 0 then
    return 'rest';
  else
    return 'empty';
  end if;
end;
$$;

-- compute_current_streak, check_and_insert_milestone, handle_habit_log_feed_event,
-- and get_friend_streak all call classify_date/compute_current_streak internally
-- and do no per-habit scheduling logic of their own — they inherit this fix
-- automatically and need no changes.

-- get_friend_day_summary: a habit not scheduled for p_target_date's day-of-week
-- must be entirely absent from the day's statuses array (not shown as
-- 'empty') — added to the existing h.created_at::date <= p_target_date filter.
create or replace function public.get_friend_day_summary(p_target_user_id uuid, p_target_date date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_authorized boolean;
  v_result jsonb;
  v_dow int;
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

  v_dow := extract(isodow from p_target_date)::int;

  select jsonb_build_object(
    'complete_count', count(*) filter (where hl.status = 'complete'),
    'missed_count', count(*) filter (where hl.status = 'missed'),
    'rest_count', count(*) filter (where hl.status = 'rest'),
    'vacation_count', count(*) filter (where hl.status = 'vacation'),
    'empty_count', count(*) filter (where hl.status is null),
    'statuses', coalesce(
      jsonb_agg(
        jsonb_build_object('habit_name', h.name, 'status', coalesce(hl.status, 'empty'))
        order by h.order_index
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.habits h
  left join public.habit_logs hl on hl.habit_id = h.id and hl.log_date = p_target_date
  where h.user_id = p_target_user_id
    and h.created_at::date <= p_target_date
    and v_dow = any(h.scheduled_days);

  return coalesce(
    v_result,
    jsonb_build_object(
      'complete_count', 0, 'missed_count', 0, 'rest_count', 0, 'vacation_count', 0, 'empty_count', 0, 'statuses', '[]'::jsonb
    )
  );
end;
$$;
