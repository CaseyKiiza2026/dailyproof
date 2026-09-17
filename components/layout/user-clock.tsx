"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { initializePreferences } from "@/lib/actions/preferences";
import { HabitsProvider } from "@/lib/hooks/use-habits-data";
import type { readPreferencesSeed } from "@/lib/preferences-seed";
import { calendarDays } from "@/lib/timezone";
import { parseDateKey } from "@/lib/dates";

interface Clock {
  userId: string | null;
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

export function UserClockProvider({ children, seed }: { children: React.ReactNode; seed?: Awaited<ReturnType<typeof readPreferencesSeed>> }) {
  const [initialSeed] = useState(seed);
  const [retry, setRetry] = useState(0);
  const [preferences, setPreferences] = useState<Awaited<ReturnType<typeof initializePreferences>> | null>(seed?.preferences ?? null);
  const [ready, setReady] = useState(seed !== undefined);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => new Date(seed?.now ?? Date.now()));

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
    let loadedUser: string | null | undefined = retry === 0 && initialSeed !== undefined ? initialSeed.preferences?.userId ?? null : undefined;
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
  }, [retry, initialSeed]);

  const timeZone = preferences?.timeZone ?? "UTC"; // Anonymous landing page only.
  const days = calendarDays(now, timeZone);
  const todayDate = useMemo(() => parseDateKey(days.today), [days.today]);
  const value: Clock = {
    userId: preferences?.userId ?? null,
    now, todayDate, ...days, timeZone,
    shareDetailedActivity: preferences?.shareDetailedActivity ?? false,
    setShareDetailedActivity: (enabled) => setPreferences((current) => current ? { ...current, shareDetailedActivity: enabled } : current)
  };

  if (error) return <div className="mx-auto min-h-screen max-w-7xl p-6"><div role="alert" className="proof-panel min-h-[600px] p-6 text-center"><p>Unable to load your preferences.</p><button className="proof-pill mt-3 px-4 py-2" onClick={() => setRetry(value => value + 1)}>Retry</button></div></div>;
  if (!ready) return <div role="status" className="mx-auto min-h-screen max-w-7xl space-y-6 p-6"><p className="text-sm text-white/50">Loading DailyProof…</p><div aria-hidden="true" className="h-16 rounded-2xl bg-white/[0.04]" /><div aria-hidden="true" className="proof-panel min-h-[600px]" /></div>;
  return <ClockContext.Provider value={value}><HabitsProvider key={value.userId ?? "anonymous"}>{children}</HabitsProvider></ClockContext.Provider>;
}

export function useUserClock(): Clock {
  const clock = useContext(ClockContext);
  if (!clock) throw new Error("UserClockProvider is required.");
  return clock;
}
