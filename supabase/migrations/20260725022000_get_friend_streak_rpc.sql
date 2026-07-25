-- Exposes current-streak-as-a-number to accepted friends without granting
-- any broader read access to habits/habit_logs. Reuses compute_current_streak
-- (the same function the milestone trigger uses) so self and friends are
-- computed identically — never a separate leaderboard-specific calculation.
create or replace function public.get_friend_streak(p_target_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_target_user_id = auth.uid() then
    return public.compute_current_streak(p_target_user_id, current_date);
  end if;

  if exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = auth.uid() and f.addressee_id = p_target_user_id)
        or (f.addressee_id = auth.uid() and f.requester_id = p_target_user_id)
      )
  ) then
    return public.compute_current_streak(p_target_user_id, current_date);
  end if;

  return null; -- not self, not an accepted friend: no streak for you
end;
$$;

grant execute on function public.get_friend_streak(uuid) to authenticated;
