"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DailySummary, FeedEvent } from "@/lib/types";
import { dayActivity, FriendSummaryResult } from "@/lib/friend-summary";
import { shiftDateKey } from "@/lib/timezone";

// The activity owner defines today, even when friends live in different zones.
// Safe feed signals identify active days; the RPC decides visible data.
export function useDailySummaries(events: FeedEvent[], minute: number) {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const userIds = [...new Set(events.filter((e) => e.eventType === "log").map((e) => e.userId))];
      try {
        const results = await Promise.all(userIds.map(async (userId) => {
          const { data, error: rpcError } = await supabase.rpc("get_friend_day_summary", { p_target_user_id: userId });
          if (rpcError?.code === "42501") return [];
          if (rpcError || !data) throw new Error("Unable to load summaries.");
          const today = data as FriendSummaryResult;
          const days = [today.today_key, shiftDateKey(today.today_key, -1)];
          const cards = await Promise.all(days.map(async (logDate): Promise<DailySummary | null> => {
            const activity = events.find((e) => e.userId === userId && e.eventType === "log" && e.logDate === logDate);
            if (!activity) return null;
            let summary = today;
            if (logDate !== today.today_key) {
              const result = await supabase.rpc("get_friend_day_summary", { p_target_user_id: userId, p_target_date: logDate });
              if (result.error?.code === "42501") return null;
              if (result.error || !result.data) throw new Error("Unable to load summaries.");
              summary = result.data as FriendSummaryResult;
            }
            return {
              ...dayActivity(summary), userId, username: summary.username,
              todayKey: summary.today_key, streak: summary.streak, lastActivityAt: activity.createdAt
            };
          }));
          return cards.filter((card): card is DailySummary => card !== null);
        }));
        if (!cancelled) {
          setSummaries(results.flat().sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)));
          setError(null);
        }
      } catch {
        if (!cancelled) { setSummaries([]); setError("Unable to load activity. Please try again."); }
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [events, minute]);

  return { summaries, loading, error };
}
