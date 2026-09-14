begin;

-- Preferences are private. Missing preferences mean UTC/summary-only until
-- first browser setup persists a detected timezone; no process-local fallback.
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'UTC',
  share_detailed_activity boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from anon;
grant select, insert, update on public.user_preferences to authenticated;
create policy preferences_owner on public.user_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create function public.validate_user_timezone() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid IANA timezone' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Preference owner cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger user_preferences_validate before insert or update on public.user_preferences
for each row execute function public.validate_user_timezone();

-- Database time helpers accept UTC instants and consult only persisted zones.
create function public.user_timezone(p_user_id uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select timezone from public.user_preferences where user_id = p_user_id), 'UTC');
$$;
create function public.user_today(p_user_id uuid, p_now timestamptz default now()) returns date
language sql stable security definer set search_path = public, pg_temp as $$
  select (p_now at time zone public.user_timezone(p_user_id))::date;
$$;

drop policy friendships_insert_as_requester on public.friendships;
create policy friendships_insert_as_requester on public.friendships for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending');
drop policy friendships_update_as_addressee on public.friendships;
create policy friendships_update_as_addressee on public.friendships for update to authenticated
  using (auth.uid() = addressee_id and status = 'pending')
  with check (auth.uid() = addressee_id and status in ('accepted', 'declined'));

-- RLS cannot compare OLD and NEW. Protect identities and transitions here,
-- including direct PostgREST writes that bypass server actions.
create function public.enforce_friendship_transition() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.requester_id is distinct from auth.uid() or new.status <> 'pending' then
      raise exception 'Only pending requests may be created by their requester' using errcode = '42501';
    end if;
  else
    if new.id is distinct from old.id
       or new.requester_id is distinct from old.requester_id
       or new.addressee_id is distinct from old.addressee_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Friendship identity cannot change' using errcode = '42501';
    end if;
    if auth.uid() is distinct from old.addressee_id or old.status <> 'pending'
       or new.status not in ('accepted', 'declined') then
      raise exception 'Only the recipient may respond to a pending request' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger friendships_enforce_transition before insert or update on public.friendships
for each row execute function public.enforce_friendship_transition();

-- Guard base data even if the pre-migration database has broader permissive
-- policies. Friends obtain selected fields only through authorized RPCs.
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
create policy habits_private_guard on public.habits as restrictive for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy habit_logs_private_guard on public.habit_logs as restrictive for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.classify_date(p_user_id uuid, p_date date)
returns text language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_complete int; v_missed int; v_rest int; v_vacation int; v_scheduled int;
begin
  select count(*), count(*) filter (where hl.status = 'complete'),
    count(*) filter (where hl.status = 'missed'), count(*) filter (where hl.status = 'rest'),
    count(*) filter (where hl.status = 'vacation')
  into v_scheduled, v_complete, v_missed, v_rest, v_vacation
  from public.habits h
  left join public.habit_logs hl on hl.habit_id = h.id and hl.user_id = h.user_id and hl.log_date = p_date
  where h.user_id = p_user_id and extract(isodow from p_date)::int = any(h.scheduled_days);

  if v_scheduled = 0 then return 'unscheduled';
  elsif v_complete + v_missed > 0 then
    if v_complete::numeric / (v_complete + v_missed) > 0.6 then return 'success';
    else return 'fail'; end if;
  elsif v_vacation > 0 then return 'vacation';
  elsif v_rest > 0 then return 'rest';
  else return 'empty'; end if;
end;
$$;

create or replace function public.compute_current_streak(p_user_id uuid, p_as_of date default null)
returns int language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_start date; v_end date; v_day date; v_type text;
  v_today date := public.user_today(p_user_id);
  v_streak int := 0; v_rest int := 0; v_vacation int := 0;
begin
  select min(log_date) into v_start from public.habit_logs where user_id = p_user_id;
  if v_start is null then return 0; end if;
  v_end := least(coalesce(p_as_of, v_today), v_today);
  -- The unfinished-day exception applies only to actual user today.
  if v_end = v_today and public.classify_date(p_user_id, v_end) = 'empty' then
    v_end := v_end - 1;
  end if;
  v_day := v_start;
  while v_day <= v_end loop
    v_type := public.classify_date(p_user_id, v_day);
    if v_type = 'unscheduled' then
      null; -- Freeze streak and rest/vacation counters, matching TypeScript.
    elsif v_type = 'success' then
      v_streak := v_streak + 1; v_rest := 0; v_vacation := 0;
    elsif v_type = 'rest' then
      v_vacation := 0; v_rest := v_rest + 1;
      if v_rest = 2 then v_streak := greatest(0, v_streak - 1);
      elsif v_rest >= 3 then v_streak := 0; end if;
    elsif v_type = 'vacation' then
      v_rest := 0; v_vacation := v_vacation + 1;
      if v_vacation >= 8 then v_streak := 0; end if;
    else
      v_streak := 0; v_rest := 0; v_vacation := 0;
    end if;
    v_day := v_day + 1;
  end loop;
  return v_streak;
end;
$$;

create or replace function public.check_and_insert_milestone(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_today date := public.user_today(p_user_id);
  v_today_streak int; v_yesterday_streak int; v_today_tier text; v_last_tier text;
begin
  v_today_streak := public.compute_current_streak(p_user_id, v_today);
  v_yesterday_streak := public.compute_current_streak(p_user_id, v_today - 1);
  v_today_tier := public.streak_tier_name(v_today_streak);
  select tier_name into v_last_tier from public.feed_events
    where user_id = p_user_id and event_type = 'milestone' order by created_at desc limit 1;
  if public.streak_tier_order(v_today_streak) > public.streak_tier_order(v_yesterday_streak)
     and v_today_tier is distinct from coalesce(v_last_tier, 'base') then
    insert into public.feed_events (user_id, event_type, tier_name)
    values (p_user_id, 'milestone', v_today_tier);
  end if;
end;
$$;

-- Feed is an activity signal, never a second copy of private habit data.
-- Scrub historical snapshots as well, so later revocation is effective.
alter table public.feed_events drop constraint feed_events_log_shape;
update public.feed_events set habit_id = null, habit_name = null, status = null, logged_late = null;
alter table public.feed_events add constraint feed_events_log_shape check (
  habit_id is null and habit_name is null and status is null and logged_late is null
  and ((event_type = 'log' and log_date is not null and tier_name is null)
    or (event_type = 'milestone' and log_date is null and tier_name is not null))
);

create or replace function public.handle_habit_log_feed_event()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user_id uuid; v_date date;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  if tg_op = 'DELETE' then v_user_id := old.user_id; v_date := old.log_date;
  else v_user_id := new.user_id; v_date := new.log_date; end if;
  -- Account deletion must not leave an event referencing a deleted user.
  if exists (select 1 from auth.users where id = v_user_id) then
    insert into public.feed_events (user_id, event_type, log_date) values (v_user_id, 'log', v_date);
    perform public.check_and_insert_milestone(v_user_id);
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
drop trigger habit_logs_feed_event on public.habit_logs;
create trigger habit_logs_feed_event after insert or update or delete on public.habit_logs
for each row execute function public.handle_habit_log_feed_event();

create function public.can_read_friend_summary(p_target_user_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and (
    p_target_user_id = auth.uid() or exists (
      select 1 from public.friendships where status = 'accepted' and (
        (requester_id = auth.uid() and addressee_id = p_target_user_id)
        or (addressee_id = auth.uid() and requester_id = p_target_user_id)
      )
    )
  );
$$;

create or replace function public.get_friend_streak(p_target_user_id uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.can_read_friend_summary(p_target_user_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return public.compute_current_streak(p_target_user_id, public.user_today(p_target_user_id));
end;
$$;

create or replace function public.get_friend_day_summary(p_target_user_id uuid, p_target_date date default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_today date; v_date date; v_details boolean; v_result jsonb;
  v_complete int; v_missed int; v_total int; v_rest int; v_vacation int; v_empty int; v_statuses jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.can_read_friend_summary(p_target_user_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  v_today := public.user_today(p_target_user_id);
  v_date := coalesce(p_target_date, v_today);
  if v_date > v_today then raise exception 'Future summaries are unavailable' using errcode = '22023'; end if;
  v_details := auth.uid() = p_target_user_id or coalesce(
    (select share_detailed_activity from public.user_preferences where user_id = p_target_user_id), false);

  select count(*), count(*) filter (where hl.status = 'complete'),
    count(*) filter (where hl.status = 'missed'), count(*) filter (where hl.status = 'rest'),
    count(*) filter (where hl.status = 'vacation'), count(*) filter (where hl.status is null),
    coalesce(jsonb_agg(jsonb_build_object('habit_name', h.name, 'status', coalesce(hl.status, 'empty')) order by h.order_index), '[]'::jsonb)
  into v_total, v_complete, v_missed, v_rest, v_vacation, v_empty, v_statuses
  from public.habits h
  left join public.habit_logs hl on hl.habit_id = h.id and hl.user_id = h.user_id and hl.log_date = v_date
  where h.user_id = p_target_user_id
    and (h.created_at at time zone public.user_timezone(p_target_user_id))::date <= v_date
    and extract(isodow from v_date)::int = any(h.scheduled_days);

  v_result := jsonb_build_object(
    'username', (select username from public.profiles where id = p_target_user_id),
    'log_date', v_date, 'today_key', v_today, 'complete_count', v_complete, 'total_count', v_total,
    'completion', case when v_complete + v_missed = 0 then 0 else round(100.0 * v_complete / (v_complete + v_missed)) end,
    'streak', public.compute_current_streak(p_target_user_id, v_today), 'details_visible', v_details
  );
  if v_details then
    v_result := v_result || jsonb_build_object('missed_count', v_missed, 'rest_count', v_rest,
      'vacation_count', v_vacation, 'empty_count', v_empty, 'statuses', v_statuses);
  end if;
  return v_result;
end;
$$;

-- The edit window must also hold for direct database writes, in the same
-- persisted timezone as the server action. Preserve habit deletion cascades.
create function public.enforce_habit_log_calendar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user_id uuid; v_habit_id uuid; v_date date; v_today date;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.habits where id = old.habit_id) then return old; end if;
    v_user_id := old.user_id; v_habit_id := old.habit_id; v_date := old.log_date;
  else
    v_user_id := new.user_id; v_habit_id := new.habit_id; v_date := new.log_date;
    if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id
      or new.habit_id is distinct from old.habit_id or new.log_date is distinct from old.log_date) then
      raise exception 'Log identity cannot change' using errcode = '42501';
    end if;
  end if;
  if auth.uid() is null or auth.uid() is distinct from v_user_id then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.habits where id = v_habit_id and user_id = v_user_id) then
    raise exception 'Habit not owned by caller' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_preferences where user_id = v_user_id) then
    raise exception 'Timezone setup required' using errcode = '22023';
  end if;
  v_today := public.user_today(v_user_id);
  if v_date is null or v_date not in (v_today, v_today - 1) then
    raise exception 'This day is outside the edit window' using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.logged_late := v_date = v_today - 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger habit_logs_enforce_calendar before insert or update or delete on public.habit_logs
for each row execute function public.enforce_habit_log_calendar();

-- Internal SECURITY DEFINER functions must never be exposed as callable RPCs.
revoke all on function public.user_timezone(uuid), public.user_today(uuid, timestamptz),
  public.can_read_friend_summary(uuid), public.classify_date(uuid, date),
  public.compute_current_streak(uuid, date), public.check_and_insert_milestone(uuid),
  public.handle_habit_log_feed_event(), public.enforce_habit_log_calendar(),
  public.enforce_friendship_transition(), public.validate_user_timezone()
  from public, anon, authenticated;
revoke all on function public.get_friend_day_summary(uuid, date), public.get_friend_streak(uuid) from public, anon;
grant execute on function public.get_friend_day_summary(uuid, date), public.get_friend_streak(uuid) to authenticated;

commit;
