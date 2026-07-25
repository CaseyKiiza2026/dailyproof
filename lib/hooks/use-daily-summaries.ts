"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DailySummary, FeedEvent, HabitStatus, HabitStatusEntry } from "@/lib/types";

interface DaySummaryRpcResult {
  complete_count: number;
  missed_count: number;
  rest_count: number;
  vacation_count: number;
  empty_count: number;
  statuses: { habit_name: string; status: HabitStatus }[];
}

function toStatusEntries(statuses: DaySummaryRpcResult["statuses"] | undefined): HabitStatusEntry[] {
  return (statuses ?? []).map((s) => ({ habitName: s.habit_name, status: s.status }));
}

// Derives one card per user for TODAY ONLY (never a separate card per
// distinct log_date) — the main feed shows exactly one card per person. A
// late edit to a prior day (via the today/yesterday edit window) still fires
// a feed_event with that earlier log_date, but it must never surface as its
// own standalone card here; it's only visible through "View activity".
export function useDailySummaries(events: FeedEvent[], todayKey: string) {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const pairs = useMemo(() => {
    const byUser = new Map<string, { userId: string; lastActivityAt: string }>();
    for (const event of events) {
      if (event.eventType !== "log" || event.logDate !== todayKey) continue;
      const existing = byUser.get(event.userId);
      if (!existing || event.createdAt > existing.lastActivityAt) {
        byUser.set(event.userId, { userId: event.userId, lastActivityAt: event.createdAt });
      }
    }
    return Array.from(byUser.values()).sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));
  }, [events, todayKey]);

  // Stable signature so the fetch effect only reruns when the actual set of
  // (user, latest-activity) pairs changes, not on every render.
  const pairsSignature = pairs.map((p) => `${p.userId}:${p.lastActivityAt}`).join(",");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (pairs.length === 0) {
        if (!cancelled) {
          setSummaries([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const supabase = createClient();

      const distinctUserIds = Array.from(new Set(pairs.map((p) => p.userId)));

      const [{ data: profileRows }, streakEntries] = await Promise.all([
        supabase.from("profiles").select("id, username").in("id", distinctUserIds),
        Promise.all(
          distinctUserIds.map(async (id) => {
            const { data } = await supabase.rpc("get_friend_streak", { p_target_user_id: id });
            return [id, (data as number | null) ?? 0] as const;
          })
        )
      ]);

      const usernameById = new Map((profileRows ?? []).map((p) => [p.id, p.username]));
      const streakById = new Map(streakEntries);

      const results = await Promise.all(
        pairs.map(async (pair): Promise<DailySummary> => {
          const { data } = await supabase.rpc("get_friend_day_summary", {
            p_target_user_id: pair.userId,
            p_target_date: todayKey
          });
          const summary = data as DaySummaryRpcResult | null;
          return {
            userId: pair.userId,
            username: usernameById.get(pair.userId) ?? "unknown",
            logDate: todayKey,
            completeCount: summary?.complete_count ?? 0,
            missedCount: summary?.missed_count ?? 0,
            restCount: summary?.rest_count ?? 0,
            vacationCount: summary?.vacation_count ?? 0,
            emptyCount: summary?.empty_count ?? 0,
            statuses: toStatusEntries(summary?.statuses),
            streak: streakById.get(pair.userId) ?? 0,
            lastActivityAt: pair.lastActivityAt
          };
        })
      );

      if (!cancelled) {
        setSummaries(results);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // pairsSignature is the real dependency; pairs itself is a new array
    // reference every render even when its contents are unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairsSignature, todayKey]);

  return { summaries, loading };
}
