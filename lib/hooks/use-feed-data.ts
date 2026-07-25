"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FeedEvent, StreakTier } from "@/lib/types";

interface RawFeedEventRow {
  id: string;
  user_id: string;
  event_type: "log" | "milestone";
  habit_id: string | null;
  habit_name: string | null;
  status: "complete" | "missed" | null;
  logged_late: boolean | null;
  tier_name: string | null;
  log_date: string | null;
  created_at: string;
}

function toFeedEvent(row: RawFeedEventRow, username: string): FeedEvent {
  return {
    id: row.id,
    userId: row.user_id,
    username,
    eventType: row.event_type,
    habitId: row.habit_id,
    habitName: row.habit_name,
    status: row.status,
    loggedLate: row.logged_late,
    tierName: row.tier_name as StreakTier | null,
    logDate: row.log_date,
    createdAt: row.created_at
  };
}

// Fetches feed_events (RLS already scopes this to "mine + accepted friends'"),
// then keeps it live via a Realtime subscription — no manual refresh needed
// per SPEC.md's "real-time, not end-of-day" requirement.
export function useFeedData() {
  const [userId, setUserId] = useState<string | null>(null);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const usernameCache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      setLoading(true);

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setUserId(null);
          setEvents([]);
          setLoading(false);
        }
        return;
      }

      const { data: rows } = await supabase
        .from("feed_events")
        .select("id, user_id, event_type, habit_id, habit_name, status, logged_late, tier_name, log_date, created_at")
        .order("created_at", { ascending: false })
        .limit(100);

      const distinctIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
      const { data: profileRows } =
        distinctIds.length > 0 ? await supabase.from("profiles").select("id, username").in("id", distinctIds) : { data: [] };
      for (const p of profileRows ?? []) usernameCache.current.set(p.id, p.username);

      if (!cancelled) {
        setUserId(user.id);
        setEvents((rows ?? []).map((r) => toFeedEvent(r, usernameCache.current.get(r.user_id) ?? "unknown")));
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Deliberately depends only on userId (stable after first load) so the
  // channel subscribes once and doesn't tear down/reconnect on every
  // unrelated state change — resubscribing risks a gap where an insert lands.
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();

    const channel = supabase
      .channel("feed_events_live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "feed_events" }, async (payload) => {
        const row = payload.new as RawFeedEventRow;

        if (!usernameCache.current.has(row.user_id)) {
          const { data: profile } = await supabase.from("profiles").select("id, username").eq("id", row.user_id).maybeSingle();
          if (profile) usernameCache.current.set(profile.id, profile.username);
        }

        const event = toFeedEvent(row, usernameCache.current.get(row.user_id) ?? "unknown");
        setEvents((current) => (current.some((e) => e.id === event.id) ? current : [event, ...current]));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { userId, events, loading };
}
