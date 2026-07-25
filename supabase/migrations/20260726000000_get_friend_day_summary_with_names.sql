-- Updates get_friend_day_summary (no table/column changes, pure function
-- replace):
--
-- 1. `statuses` now returns [{habit_name, status}, ...] instead of an
--    anonymous status list, ordered by order_index — the main feed card
--    already shows habit names (per the live screenshot), and the new
--    7-day "View activity" history needs them too, so the privacy-light
--    anonymous-array design from the original migration is replaced.
-- 2. Added `h.created_at::date <= p_target_date` to the WHERE clause. This
--    RPC will now be called once per day across a 7-day range for "View
--    activity" — without this filter, a habit created partway through that
--    range would incorrectly show as 'empty' on days before it existed,
--    instead of being absent from that day's list entirely.
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
    and h.created_at::date <= p_target_date;

  return coalesce(
    v_result,
    jsonb_build_object(
      'complete_count', 0, 'missed_count', 0, 'rest_count', 0, 'vacation_count', 0, 'empty_count', 0, 'statuses', '[]'::jsonb
    )
  );
end;
$$;
