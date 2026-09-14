"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DayActivity } from "@/lib/types";
import { dayActivity, FriendSummaryResult } from "@/lib/friend-summary";
import { shiftDateKey } from "@/lib/timezone";

export function useActivityHistory() {
  const [days, setDays] = useState<DayActivity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reauthorize on every open, including after consent may have been revoked.
  async function load(userId: string, referenceDateKey: string) {
    setLoading(true);
    setDays(null);
    setError(null);
    try {
      const supabase = createClient();
      const results = await Promise.all(Array.from({ length: 7 }, async (_, index) => {
        const { data, error: rpcError } = await supabase.rpc("get_friend_day_summary", {
          p_target_user_id: userId, p_target_date: shiftDateKey(referenceDateKey, -index)
        });
        if (rpcError || !data) throw new Error("Unable to load activity.");
        return dayActivity(data as FriendSummaryResult);
      }));
      setDays(results);
    } catch { setError("Unable to load activity."); }
    finally { setLoading(false); }
  }

  return { days, loading, error, load };
}
