-- Accountability Feed: feed_events table, RLS, and the triggers that generate
-- entries from real habit_logs activity. Bundled into one migration (schema +
-- RLS + triggers + realtime) the same way friendships/nudges was, since the
-- table would be unsafe to leave live without its RLS policy for even a
-- moment, and the triggers are what make the table meaningful at all.
--
-- Do not apply yet — review, then run in the SQL Editor yourself.

-- feed_events: one row per visible accountability moment. Shape is enforced by
-- feed_events_log_shape below: a 'log' event always carries habit_id+status
-- and never tier_name; a 'milestone' event always carries tier_name and never
-- habit_id/status.
create table public.feed_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  event_type text not null check (event_type in ('log', 'milestone')),
  habit_id uuid references public.habits on delete cascade,
  status text check (status in ('complete', 'missed')),
  tier_name text check (tier_name in ('base', 'spark', 'ember', 'flame', 'blaze', 'inferno', 'legend', 'mythic')),
  created_at timestamptz default now(),
  constraint feed_events_log_shape check (
    (event_type = 'log' and habit_id is not null and status is not null and tier_name is null)
    or
    (event_type = 'milestone' and habit_id is null and status is null and tier_name is not null)
  )
);

create index feed_events_user_id_idx on public.feed_events (user_id);
create index feed_events_created_at_idx on public.feed_events (created_at desc);

alter table public.feed_events enable row level security;

-- A user sees their own events, plus events from anyone they have an
-- ACCEPTED friendship with (either direction).
create policy "feed_events_select_self_or_friend"
  on public.feed_events for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = feed_events.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = feed_events.user_id)
        )
    )
  );

-- No insert/update/delete policies for any client role — feed_events is
-- system-generated only, via the SECURITY DEFINER trigger functions below
-- (which run as the function owner and so bypass RLS), never directly from
-- the client. That's the entire enforcement mechanism: there is no policy a
-- user's own insert/update/delete could ever match.

-- ---------------------------------------------------------------------------
-- Streak math mirrored from lib/stats.ts (classifyDate / simulateStreak /
-- computeCurrentStreak). These MUST stay in sync with that file by hand —
-- there's no shared runtime between Postgres and the Next.js app. If the
-- rules in lib/stats.ts ever change, update these functions to match.
-- ---------------------------------------------------------------------------

-- Mirrors classifyDate(habits, dateKey), but reads a user's own habit_logs
-- directly instead of taking an in-memory habits array.
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
begin
  select
    count(*) filter (where status = 'complete'),
    count(*) filter (where status = 'missed'),
    count(*) filter (where status = 'rest'),
    count(*) filter (where status = 'vacation')
  into v_complete, v_missed, v_rest, v_vacation
  from public.habit_logs
  where user_id = p_user_id and log_date = p_date;

  if v_complete + v_missed > 0 then
    if v_complete::numeric / (v_complete + v_missed) >= 0.5 then
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

-- Mirrors trimEmptyToday + simulateStreak + computeCurrentStreak combined:
-- forward-simulates from the user's earliest log through p_as_of (skipping
-- p_as_of itself if it has zero logs, per the "today exception"), applying
-- the same rest/vacation escalation rules. p_as_of defaults to today, but the
-- milestone check below also calls this with "yesterday" to diff against.
create or replace function public.compute_current_streak(p_user_id uuid, p_as_of date default current_date)
returns int
language plpgsql
stable
as $$
declare
  v_start date;
  v_end date;
  v_day date;
  v_type text;
  v_streak int := 0;
  v_consecutive_rest int := 0;
  v_consecutive_vacation int := 0;
begin
  select min(log_date) into v_start from public.habit_logs where user_id = p_user_id;
  if v_start is null then
    return 0;
  end if;

  v_end := p_as_of;
  if public.classify_date(p_user_id, v_end) = 'empty' then
    v_end := v_end - 1;
  end if;

  v_day := v_start;
  while v_day <= v_end loop
    v_type := public.classify_date(p_user_id, v_day);

    if v_type = 'success' then
      v_streak := v_streak + 1;
      v_consecutive_rest := 0;
      v_consecutive_vacation := 0;
    elsif v_type = 'rest' then
      v_consecutive_vacation := 0;
      v_consecutive_rest := v_consecutive_rest + 1;
      if v_consecutive_rest = 2 then
        v_streak := greatest(0, v_streak - 1);
      elsif v_consecutive_rest >= 3 then
        v_streak := 0;
      end if;
    elsif v_type = 'vacation' then
      v_consecutive_rest := 0;
      v_consecutive_vacation := v_consecutive_vacation + 1;
      if v_consecutive_vacation >= 8 then
        v_streak := 0;
      end if;
    else -- 'fail' or 'empty'
      v_streak := 0;
      v_consecutive_rest := 0;
      v_consecutive_vacation := 0;
    end if;

    v_day := v_day + 1;
  end loop;

  return v_streak;
end;
$$;

-- Mirrors SPEC.md section 6's tier table exactly.
create or replace function public.streak_tier_name(p_streak int)
returns text
language sql
immutable
as $$
  select case
    when p_streak >= 365 then 'mythic'
    when p_streak >= 180 then 'legend'
    when p_streak >= 90 then 'inferno'
    when p_streak >= 30 then 'blaze'
    when p_streak >= 14 then 'flame'
    when p_streak >= 7 then 'ember'
    when p_streak >= 3 then 'spark'
    else 'base'
  end;
$$;

create or replace function public.streak_tier_order(p_streak int)
returns int
language sql
immutable
as $$
  select case
    when p_streak >= 365 then 7
    when p_streak >= 180 then 6
    when p_streak >= 90 then 5
    when p_streak >= 30 then 4
    when p_streak >= 14 then 3
    when p_streak >= 7 then 2
    when p_streak >= 3 then 1
    else 0
  end;
$$;

-- Fires a milestone only on a genuine forward crossing: today's tier must be
-- strictly higher than yesterday's (so a break/reset never itself posts a
-- "back to Base" event — resets are silent, only climbs are milestones), AND
-- must differ from the most recently recorded milestone tier for this user
-- (guards against firing the same tier twice if multiple habit_logs writes
-- land on the same day and the day's classification flips back and forth).
-- Comparing against "yesterday" rather than "the last milestone ever" is what
-- lets the same tier fire again on a later, separate streak run.
create or replace function public.check_and_insert_milestone(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today_streak int;
  v_yesterday_streak int;
  v_today_tier text;
  v_last_tier text;
begin
  v_today_streak := public.compute_current_streak(p_user_id, current_date);
  v_yesterday_streak := public.compute_current_streak(p_user_id, current_date - 1);
  v_today_tier := public.streak_tier_name(v_today_streak);

  select tier_name into v_last_tier
  from public.feed_events
  where user_id = p_user_id and event_type = 'milestone'
  order by created_at desc
  limit 1;

  if public.streak_tier_order(v_today_streak) > public.streak_tier_order(v_yesterday_streak)
     and v_today_tier is distinct from coalesce(v_last_tier, 'base') then
    insert into public.feed_events (user_id, event_type, tier_name)
    values (p_user_id, 'milestone', v_today_tier);
  end if;
end;
$$;

-- Fires a 'log' feed event whenever a habit_logs row's status BECOMES
-- complete or missed (not rest/vacation, and not a no-op rewrite of the same
-- status), then checks for a tier crossing on the same write.
create or replace function public.handle_habit_log_feed_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status not in ('complete', 'missed') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  insert into public.feed_events (user_id, event_type, habit_id, status)
  values (new.user_id, 'log', new.habit_id, new.status);

  perform public.check_and_insert_milestone(new.user_id);

  return new;
end;
$$;

create trigger habit_logs_feed_event
  after insert or update on public.habit_logs
  for each row
  execute function public.handle_habit_log_feed_event();

-- Realtime: add feed_events to the publication Supabase's Realtime server
-- watches, so postgres_changes subscriptions can receive live INSERTs.
-- Realtime respects the table's RLS for each subscriber, so a friend's
-- browser only ever receives events it would also be allowed to SELECT.
alter publication supabase_realtime add table public.feed_events;
