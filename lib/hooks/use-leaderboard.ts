"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Friendship } from "@/lib/types";

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
export function useLeaderboard(selfId: string | null, selfUsername: string | null, selfStreak: number, acceptedFriends: Friendship[]) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

      const friendEntries = await Promise.all(
        acceptedFriends.map(async (f): Promise<LeaderboardEntry> => {
          const { data: streak } = await supabase.rpc("get_friend_streak", { p_target_user_id: f.otherUser.id });
          return { userId: f.otherUser.id, username: f.otherUser.username, isSelf: false, streak: streak ?? 0 };
        })
      );

      if (!cancelled) {
        const all: LeaderboardEntry[] = [
          { userId: selfId, username: selfUsername ?? "you", isSelf: true, streak: selfStreak },
          ...friendEntries
        ];
        all.sort((a, b) => b.streak - a.streak);
        setEntries(all);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selfId, selfUsername, selfStreak, acceptedFriends]);

  return { entries, loading };
}
