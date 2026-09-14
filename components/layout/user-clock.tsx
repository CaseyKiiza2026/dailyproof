"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { initializePreferences } from "@/lib/actions/preferences";
import { calendarDays } from "@/lib/timezone";
import { parseDateKey } from "@/lib/dates";

interface Clock {
  now: Date;
  todayDate: Date;
  today: string;
  yesterday: string;
  tomorrow: string;
  timeZone: string;
  shareDetailedActivity: boolean;
  setShareDetailedActivity: (enabled: boolean) => void;
}

const ClockContext = createContext<Clock | null>(null);

export function UserClockProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<Awaited<ReturnType<typeof initializePreferences>> | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let generation = 0;
    let loadedUser: string | null | undefined;
    async function load(userId: string | null) {
      if (loadedUser === userId) return;
      loadedUser = userId;
      const request = ++generation;
      setReady(false);
      setError(false);
      try {
        const result = userId
          ? await initializePreferences(Intl.DateTimeFormat().resolvedOptions().timeZone)
          : null;
        if (disposed || request !== generation) return;
        if (result && result.userId !== userId) throw new Error("Session changed.");
        setPreferences(result);
        setNow(new Date());
        setReady(true);
      } catch {
        if (!disposed && request === generation) setError(true);
      }
    }
    // Defer work outside the Supabase auth callback's lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => { if (!disposed) void load(session?.user.id ?? null); });
    });
    return () => { disposed = true; generation++; subscription.unsubscribe(); };
  }, []);

  const timeZone = preferences?.timeZone ?? "UTC"; // Anonymous landing page only.
  const days = calendarDays(now, timeZone);
  const todayDate = useMemo(() => parseDateKey(days.today), [days.today]);
  const value: Clock = {
    now, todayDate, ...days, timeZone,
    shareDetailedActivity: preferences?.shareDetailedActivity ?? false,
    setShareDetailedActivity: (enabled) => setPreferences((current) => current ? { ...current, shareDetailedActivity: enabled } : current)
  };

  if (error) return <div className="p-6 text-center"><p>Unable to load your preferences.</p><button className="proof-pill mt-3 px-4 py-2" onClick={() => window.location.reload()}>Retry</button></div>;
  if (!ready) return <p className="p-6 text-center text-sm text-white/50">Loading DailyProof…</p>;
  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>;
}

export function useUserClock(): Clock {
  const clock = useContext(ClockContext);
  if (!clock) throw new Error("UserClockProvider is required.");
  return clock;
}
