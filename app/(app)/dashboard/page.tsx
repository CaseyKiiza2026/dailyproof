"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ProgressOverview } from "@/components/dashboard/progress-overview";
import { HabitGrid } from "@/components/dashboard/habit-grid";
import { useDashboardHabits } from "@/lib/hooks/use-dashboard-habits";
import { useHabitStats } from "@/lib/hooks/use-habit-stats";
import styles from "./dashboard.module.css";
import { useUserClock } from "@/components/layout/user-clock";
import { useTasks } from "@/lib/hooks/use-tasks";
import { dailyProgress } from "@/lib/daily-progress";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function MonthMenu({
  viewYear,
  viewMonth,
  realYear,
  realMonth,
  onSelect,
}: {
  viewYear: number;
  viewMonth: number;
  realYear: number;
  realMonth: number;
  onSelect: (year: number, month: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const options = Array.from({ length: 13 }, (_, index) => {
    const offset = 12 - index;
    const date = new Date(realYear, realMonth - offset, 1);
    return { year: date.getFullYear(), month: date.getMonth() };
  });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="proof-pill proof-focus h-11 min-w-[150px] justify-between px-4 text-sm font-bold transition active:scale-[0.97]"
      >
        {MONTH_NAMES[viewMonth]} {viewYear}{" "}
        <ChevronDown size={15} className="text-white/35" />
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-20 max-h-64 w-48 overflow-y-auto rounded-xl border border-white/[0.09] bg-proof-panel2 shadow-proof-card">
          {options.map(({ year, month }) => {
            const active = year === viewYear && month === viewMonth;
            return (
              <button
                key={`${year}-${month}`}
                type="button"
                onClick={() => {
                  onSelect(year, month);
                  setOpen(false);
                }}
                className={`flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold transition hover:bg-white/[0.06] active:bg-white/[0.1] sm:min-h-0 sm:text-xs ${
                  active ? "text-proof-green" : "text-white/75"
                }`}
              >
                {MONTH_NAMES[month]} {year}
                {year === realYear && month === realMonth && (
                  <span className="text-[9px] text-white/30">now</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const dashboard = useDashboardHabits();
  const habitStats = useHabitStats(
    dashboard.habits,
    dashboard.monthlyDateKeys,
    dashboard.streakDateKeys,
  );
  const { today, timeZone } = useUserClock();
  const taskData = useTasks();
  const progress = dailyProgress(
    dashboard.habits,
    taskData.tasks,
    today,
    timeZone,
  );
  const stats = { ...habitStats, ...progress };
  const habitsReady =
    dashboard.ready ?? (!dashboard.loading && (!dashboard.error || dashboard.habits.length > 0));
  const progressReady = habitsReady && taskData.ready;

  const selectedIso = `${dashboard.viewYear}-${String(dashboard.viewMonth + 1).padStart(2, "0")}-${String(
    dashboard.selectedDay,
  ).padStart(2, "0")}`;

  return (
    <div
      className={`${styles.dashboard} home-page space-y-4 pb-[env(safe-area-inset-bottom)] sm:space-y-6 sm:pb-0`}
    >
      {dashboard.error && (
        <p role="alert" className="text-proof-red">
          {dashboard.error}
        </p>
      )}
      <header className="home-heading"><div className="lg:hidden"><Logo /></div><h1 className="hidden lg:block">Home</h1><p className="text-sm text-white/55">{dashboard.realToday}</p></header>
      <ProgressOverview habits={dashboard.habits} stats={stats} habitsReady={habitsReady} ready={progressReady} />
      <div className="flex items-center gap-2">
        <MonthMenu
          viewYear={dashboard.viewYear}
          viewMonth={dashboard.viewMonth}
          realYear={dashboard.realYear}
          realMonth={dashboard.realMonth}
          onSelect={dashboard.jumpToMonth}
        />
        <label className="proof-pill proof-focus relative h-11 w-11 cursor-pointer transition active:scale-[0.97]">
          <CalendarDays size={17} className="pointer-events-none" />
          <input
            type="date"
            aria-label="Jump to date"
            value={selectedIso}
            onChange={(event) => dashboard.jumpToDate(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>

      {taskData.error && (
        <p role="alert" className="text-sm text-proof-red">
          {taskData.error}
        </p>
      )}
      {!habitsReady && dashboard.error ? (
        <section
          className="proof-panel min-h-64 p-4"
          aria-label="Habits unavailable"
        >
          Habits unavailable.
        </section>
      ) : (
        <HabitGrid
          dashboard={dashboard}
          stats={stats}
          statsReady={progressReady}
        />
      )}
    </div>
  );
}
