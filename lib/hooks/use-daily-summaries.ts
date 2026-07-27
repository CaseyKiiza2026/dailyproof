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

// Derives up to two cards per user — one for TODAY, one for YESTERDAY — each
// only if that person actually has a 'log' feed_event for that specific day.
// This mirrors the today/yesterday edit window: a late edit to yesterday is
// now just as visible as a same-day log, as its own standalone card, not
// merged into today's or hidden. Anything older than yesterday still never
// gets a standalone card here; it's only visible through "View activity".
export function useDailySummaries(events: FeedEvent[], todayKey: string, yesterdayKey: string) {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const pairs = useMemo(() => {
    // Keyed by `${userId}:${logDate}` so today and yesterday for the same
    // person are tracked as two independent entries, not collapsed into one.
    const byKey = new Map<string, { userId: string; logDate: string; lastActivityAt: string }>();
    for (const event of events) {
      if (event.eventType !== "log") continue;
      if (event.logDate !== todayKey && event.logDate !== yesterdayKey) continue;
      const key = `${event.userId}:${event.logDate}`;
      const existing = byKey.get(key);
      if (!existing || event.createdAt > existing.lastActivityAt) {
        byKey.set(key, { userId: event.userId, logDate: event.logDate, lastActivityAt: event.createdAt });
      }
    }
    return Array.from(byKey.values()).sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));
  }, [events, todayKey, yesterdayKey]);

  // Stable signature so the fetch effect only reruns when the actual set of
  // (user, day, latest-activity) pairs changes, not on every render.
  const pairsSignature = pairs.map((p) => `${p.userId}:${p.logDate}:${p.lastActivityAt}`).join(",");

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
            p_target_date: pair.logDate
          });
          const summary = data as DaySummaryRpcResult | null;
          return {
            userId: pair.userId,
            username: usernameById.get(pair.userId) ?? "unknown",
            logDate: pair.logDate,
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
  }, [pairsSignature, todayKey, yesterdayKey]);

  return { summaries, loading };
}
