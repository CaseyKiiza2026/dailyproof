"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dateKeyRange, parseDateKey } from "@/lib/dates";
import { DayActivity, HabitStatus, HabitStatusEntry } from "@/lib/types";

interface DaySummaryRpcResult {
  complete_count: number;
  missed_count: number;
  rest_count: number;
  vacation_count: number;
  empty_count: number;
  statuses: { habit_name: string; status: HabitStatus }[];
}

// Fetches get_friend_day_summary once per day across a 7-day window (the
// reference date plus the 6 before it), most recent first. Lazy: only called
// when "View activity" is actually opened, and caches by (userId, referenceDate)
// so re-opening the same card doesn't refetch.
export function useActivityHistory() {
  const [days, setDays] = useState<DayActivity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  async function load(userId: string, referenceDateKey: string) {
    const key = `${userId}|${referenceDateKey}`;
    if (loadedKey === key) return;

    setLoading(true);
    const supabase = createClient();

    const referenceDate = parseDateKey(referenceDateKey);
    const rangeStart = new Date(referenceDate);
    rangeStart.setDate(rangeStart.getDate() - 6);
    const rangeKeys = dateKeyRange(rangeStart, referenceDate).reverse(); // most recent first

    const results = await Promise.all(
      rangeKeys.map(async (logDate): Promise<DayActivity> => {
        const { data } = await supabase.rpc("get_friend_day_summary", { p_target_user_id: userId, p_target_date: logDate });
        const summary = data as DaySummaryRpcResult | null;
        const statuses: HabitStatusEntry[] = (summary?.statuses ?? []).map((s) => ({ habitName: s.habit_name, status: s.status }));
        return {
          logDate,
          completeCount: summary?.complete_count ?? 0,
          missedCount: summary?.missed_count ?? 0,
          restCount: summary?.rest_count ?? 0,
          vacationCount: summary?.vacation_count ?? 0,
          emptyCount: summary?.empty_count ?? 0,
          statuses
        };
      })
    );

    setDays(results);
    setLoadedKey(key);
    setLoading(false);
  }

  return { days, loading, load };
}
