"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, Flame, Trophy, XCircle } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { StatCard } from "@/components/ui/stat-card";
import { HabitGrid } from "@/components/dashboard/habit-grid";
import { useDashboardHabits } from "@/lib/hooks/use-dashboard-habits";
import { useHabitStats } from "@/lib/hooks/use-habit-stats";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function MonthMenu({
  viewYear,
  viewMonth,
  realYear,
  realMonth,
  onSelect
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
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
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
        {MONTH_NAMES[viewMonth]} {viewYear} <ChevronDown size={15} className="text-white/35" />
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-20 max-h-64 w-48 overflow-y-auto rounded-xl border border-white/[0.09] bg-[#0d110f] shadow-proof-card">
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
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold transition hover:bg-white/[0.06] active:bg-white/[0.1] ${
                  active ? "text-proof-green" : "text-white/75"
                }`}
              >
                {MONTH_NAMES[month]} {year}
                {year === realYear && month === realMonth && <span className="text-[9px] text-white/30">now</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const dashboard = useDashboardHabits();
  const stats = useHabitStats(dashboard.habits, dashboard.monthlyDateKeys, dashboard.streakDateKeys);

  const selectedIso = `${dashboard.viewYear}-${String(dashboard.viewMonth + 1).padStart(2, "0")}-${String(
    dashboard.selectedDay
  ).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Logo />
        <div className="proof-pill border-proof-green/25 bg-proof-green/[0.05] px-4 py-2 text-xs font-bold text-proof-green">
          <Trophy size={14} className="mr-2" />
          {stats.completion >= 50 ? "Winning the month" : "Keep pushing"}
        </div>
      </header>

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

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Completion" value={`${stats.completion}%`} icon={CheckCircle2} tone="green" />
        <StatCard label="Current streak" value={stats.currentStreak} suffix="days" icon={Flame} tone="green" />
        <StatCard label="Best streak" value={stats.bestStreak} suffix="days" icon={Trophy} tone="amber" />
        <StatCard label="Missed" value={stats.missed} suffix="days" icon={XCircle} tone="red" />
        <StatCard label="Completed" value={stats.completed} suffix="days" icon={CheckCircle2} tone="green" />
      </section>

      <HabitGrid dashboard={dashboard} stats={stats} />
    </div>
  );
}
