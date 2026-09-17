"use client";

import { useEffect, useState } from "react";
import { isAuthorizationError, requireRead } from "@/lib/read-errors";
import { createClient } from "@/lib/supabase/client";
import { FeedEvent, Friendship } from "@/lib/types";
import { useUserClock } from "@/components/layout/user-clock";

export interface LeaderboardEntry {
  userId: string;
  username: string;
  isSelf: boolean;
  streak: number;
}

// Ranks the current user + their accepted friends by current streak, all
// computed via the same get_friend_streak RPC (which itself just calls the
// same compute_current_streak() the milestone trigger uses) — no separate
// leaderboard-specific math.
//
// `events` is the SAME live feed_events stream useFeedData already keeps
// current via its Realtime subscription (no second channel opened here) — a
// new event arriving for self or any accepted friend means their streak may
// have just changed, so it's used as a refetch trigger. Without this, a
// friend's entry would only ever reflect their streak as of whenever this
// hook first mounted, going stale the moment they logged anything afterward.
export function useLeaderboard(
  selfId: string | null,
  selfUsername: string | null,
  selfStreak: number | null,
  acceptedFriends: Friendship[],
  events: FeedEvent[]
) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,setError]=useState<string | null>(null);
  const { now } = useUserClock();
  const minute = Math.floor(now.getTime() / 60000);

  const latestEvent = events[0];
  const latestEventKey = latestEvent ? `${latestEvent.id}:${latestEvent.userId}` : "";

  const friendsKey = JSON.stringify(acceptedFriends.map(f => ({id: f.otherUser.id, username: f.otherUser.username})));
  useEffect(() => {
    const targets: {id: string; username: string}[] = JSON.parse(friendsKey);
    let cancelled = false;

    async function load() {
      if (!selfId) {
        if (!cancelled) {
          setEntries([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const supabase = createClient();

      const friendEntries = await Promise.allSettled(
        targets.map(async (f): Promise<LeaderboardEntry> => {
          const { data: streak, error: readError } = await supabase.rpc("get_friend_streak", { p_target_user_id: f.id });
          if (isAuthorizationError(readError) && !cancelled) setEntries(current => current.filter(entry => entry.userId !== f.id));
          requireRead(streak, readError);
          if (typeof streak !== "number" || !Number.isFinite(streak)) throw new Error("Invalid streak result.");
          return { userId: f.id, username: f.username, isSelf: false, streak };
        })
      );

      if (!cancelled) {
        setEntries(current => {
          const all: LeaderboardEntry[] = [];
          friendEntries.forEach((result,index) => {
            if(result.status === "fulfilled") all.push(result.value);
            else if(!isAuthorizationError(result.reason)) {
              const previous=current.find(entry => !entry.isSelf && entry.userId === targets[index].id);
              if(previous) all.push(previous);
            }
          });
          return all.sort((a,b)=>b.streak-a.streak);
        });
        setError(friendEntries.some(result=>result.status === "rejected") ? "Unable to refresh some streaks. Previously loaded values may be out of date." : null);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selfId, friendsKey, latestEventKey, minute]);

  const visible = entries.filter(entry => acceptedFriends.some(f => f.otherUser.id === entry.userId));
  if (selfId && selfStreak !== null) visible.push({userId: selfId, username: selfUsername ?? "you", isSelf: true, streak: selfStreak});
  return { entries: visible.sort((a,b) => b.streak - a.streak), loading, error };
}
