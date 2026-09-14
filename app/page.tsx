"use client";

import { useUserClock } from "@/components/layout/user-clock";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Flame, Grid3X3, UsersRound } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { useHabitsData } from "@/lib/hooks/use-habits-data";
import { useHabitStats } from "@/lib/hooks/use-habit-stats";
import { parseDateKey, dateKeyRange, formatDateKey, monthDateKeys } from "@/lib/dates";
import { dayTone, TONE_CLASS } from "@/lib/heatmap-tone";

const features = [
  { icon: Grid3X3, title: "Track the month", copy: "Habits as rows. Days as proof." },
  { icon: Flame, title: "See momentum", copy: "Streaks you can actually feel." },
  { icon: UsersRound, title: "Stay accountable", copy: "Real-time check-ins, no noisy feed." }
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function HomePage() {
  const { habits, earliestLogDate } = useHabitsData();
  const { todayDate: realNow } = useUserClock();
  const year = realNow.getFullYear();
  const month = realNow.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Same real data path as the Dashboard/Year page: current-month scope for
  // completion/completed, full history through today for the streak.
  const monthlyDateKeys = useMemo(() => monthDateKeys(year, month, realNow.getDate()), [year, month, realNow]);
  const streakDateKeys = useMemo(() => {
    const start = earliestLogDate ? parseDateKey(earliestLogDate) : realNow;
    return dateKeyRange(start, realNow);
  }, [earliestLogDate, realNow]);
  const stats = useHabitStats(habits, monthlyDateKeys, streakDateKeys);

  const heroCells = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const dateKey = formatDateKey(new Date(year, month, day));
        const isFuture = day > realNow.getDate();
        return dayTone(habits, dateKey, isFuture);
      }),
    [habits, year, month, daysInMonth, realNow]
  );

  return (
    <main className="min-h-screen overflow-hidden">
      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
        <nav className="flex items-center justify-between"><Logo /><Link href="/auth" className="proof-pill px-4 py-2 text-sm font-bold">Login</Link></nav>
        <section className="grid items-center gap-12 py-20 lg:grid-cols-[1fr_.9fr] lg:py-28">
          <div><p className="proof-kicker text-proof-green">GitHub-style accountability</p><h1 className="mt-5 max-w-2xl text-5xl font-black leading-[.96] tracking-[-0.065em] sm:text-7xl">Your consistency should leave evidence.</h1><p className="mt-6 max-w-xl text-base leading-7 text-white/42">DailyProof turns habits into a visible record—monthly grids, yearly heatmaps, and lightweight friend accountability without the social-media noise.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/dashboard" className="inline-flex h-12 items-center gap-2 rounded-2xl bg-proof-green px-5 text-sm font-black text-black shadow-proof-button">View the demo<ArrowRight size={17} /></Link><Link href="/auth" className="proof-pill h-12 px-5 text-sm font-bold">Create your proof</Link></div></div>
          <div className="proof-panel relative overflow-hidden p-5 shadow-[0_35px_120px_rgba(0,0,0,.7)]">
            <div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-proof-green/10 blur-3xl" />
            <div className="relative flex items-center justify-between">
              <span className="font-black">{MONTH_NAMES[month]} {year}</span>
              <span className="rounded-full border border-proof-green/25 bg-proof-green/10 px-3 py-1 text-xs font-bold text-proof-green">{stats.completion >= 50 ? "Winning" : "This month"}</span>
            </div>
            <div className="relative mt-6 grid grid-cols-7 gap-2 sm:grid-cols-10">
              {heroCells.map((tone, i) => <span key={i} className={`aspect-square rounded-[5px] border border-white/[0.045] ${TONE_CLASS[tone]}`} />)}
            </div>
            <div className="relative mt-6 grid grid-cols-3 gap-3">
              {[[`${stats.completion}%`, "Score"], [`${stats.currentStreak}`, "Streak"], [`${stats.completed}`, "Done"]].map(([v, l]) => (
                <div className="rounded-2xl border border-white/[0.08] bg-black/25 p-3" key={l}>
                  <p className="text-xl font-black">{v}</p>
                  <p className="text-[10px] uppercase tracking-[.1em] text-white/30">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="grid gap-4 pb-20 sm:grid-cols-3">{features.map(({icon: Icon,title,copy})=><article key={title} className="proof-panel p-5"><Icon className="text-proof-green" /><h2 className="mt-5 font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-white/35">{copy}</p></article>)}</section>
      </div>
    </main>
  );
}
