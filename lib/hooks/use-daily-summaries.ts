"use client";

import { useEffect, useState } from "react";
import { isAuthorizationError, requireRead } from "@/lib/read-errors";
import { createClient } from "@/lib/supabase/client";
import { DailySummary, FeedEvent } from "@/lib/types";
import { dayActivity, FriendSummaryResult } from "@/lib/friend-summary";
import { shiftDateKey } from "@/lib/timezone";

function hideDetails(card: DailySummary): DailySummary {
  return { ...card, detailsVisible: false, statuses: [], missedCount: 0, restCount: 0, vacationCount: 0, emptyCount: 0 };
}

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
        const results = await Promise.allSettled(userIds.map(async (userId) => {
          const { data, error: rpcError } = await supabase.rpc("get_friend_day_summary", { p_target_user_id: userId });
          if (isAuthorizationError(rpcError)) {
            if (!cancelled) setSummaries(current => current.filter(card => card.userId !== userId));
            return [];
          }
          requireRead(data, rpcError);
          const today = data as FriendSummaryResult;
          let detailsRevoked = !today.details_visible;
          // A newly observed privacy revocation takes effect even if a later
          // historical read fails. Never retain old detailed cards in that case.
          const clearDetails = () => {
            if (!cancelled) setSummaries(current => current.map(card => card.userId === userId ? hideDetails(card) : card));
          };
          if (detailsRevoked) clearDetails();
          const days = [today.today_key, shiftDateKey(today.today_key, -1)];
          const cards = await Promise.all(days.map(async (logDate): Promise<DailySummary | null> => {
            const activity = events.find((e) => e.userId === userId && e.eventType === "log" && e.logDate === logDate);
            if (!activity) return null;
            let summary = today;
            if (logDate !== today.today_key) {
              const result = await supabase.rpc("get_friend_day_summary", { p_target_user_id: userId, p_target_date: logDate });
              if (isAuthorizationError(result.error)) {
                if (!cancelled) setSummaries(current => current.filter(card => card.userId !== userId));
                throw result.error;
              }
              requireRead(result.data, result.error);
              summary = result.data as FriendSummaryResult;
              if (!summary.details_visible) { detailsRevoked = true; clearDetails(); }
            }
            return {
              ...dayActivity(summary), userId, username: summary.username,
              todayKey: summary.today_key, streak: summary.streak, lastActivityAt: activity.createdAt
            };
          }));
          return cards.filter((card): card is DailySummary => card !== null).map(card => detailsRevoked ? hideDetails(card) : card);
        }));
        if (!cancelled) {
          setSummaries(current => results.flatMap((result,index) => result.status === "fulfilled"
            ? result.value
            : isAuthorizationError(result.reason) ? [] : current.filter(card => card.userId === userIds[index]))
            .sort((a,b) => b.lastActivityAt.localeCompare(a.lastActivityAt)));
          setError(results.some(result => result.status === "rejected") ? "Unable to refresh some activity. Previously loaded activity may be out of date." : null);
        }
      } catch {
        if (!cancelled) { setError("Unable to load activity. Please try again."); }
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [events, minute]);

  return { summaries, loading, error };
}
