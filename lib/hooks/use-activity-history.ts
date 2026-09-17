"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DayActivity } from "@/lib/types";
import { dayActivity, FriendSummaryResult } from "@/lib/friend-summary";
import { shiftDateKey } from "@/lib/timezone";

export function useActivityHistory() {
  const [days, setDays] = useState<DayActivity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  function close() { generation.current++; setDays(null); setLoading(false); setError(null); }

  // Reauthorize on every open, including after consent may have been revoked.
  async function load(userId: string, referenceDateKey: string) {
    const request = ++generation.current;
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
      if (request !== generation.current) return;
      const revoked = results.some(day => !day.detailsVisible);
      setDays(revoked ? results.map(day => ({...day, detailsVisible: false, statuses: []})) : results);
    } catch { if (request === generation.current) setError("Unable to load activity."); }
    finally { if (request === generation.current) setLoading(false); }
  }

  return { days, loading, error, load, close };
}
