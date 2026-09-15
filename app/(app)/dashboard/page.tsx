"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, Flame, Trophy, XCircle } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { StatCard } from "@/components/ui/stat-card";
import { HabitGrid } from "@/components/dashboard/habit-grid";
import { useDashboardHabits } from "@/lib/hooks/use-dashboard-habits";
import { useHabitStats } from "@/lib/hooks/use-habit-stats";
import styles from "./dashboard.module.css";
import Link from "next/link";
import {useUserClock} from "@/components/layout/user-clock";
import {useTasks} from "@/lib/hooks/use-tasks";
import {dailyProgress,isTaskOnDay} from "@/lib/daily-progress";
import {ProofPanel} from "@/components/proofs/proof-panel";

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
                className={`flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold transition hover:bg-white/[0.06] active:bg-white/[0.1] sm:min-h-0 sm:text-xs ${
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
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const dashboard = useDashboardHabits();
  const habitStats = useHabitStats(dashboard.habits, dashboard.monthlyDateKeys, dashboard.streakDateKeys);
  const {today,timeZone}=useUserClock();const taskData=useTasks();
  const progress=dailyProgress(dashboard.habits,taskData.tasks,today,timeZone);
  const stats={...habitStats,...progress};

  const selectedIso = `${dashboard.viewYear}-${String(dashboard.viewMonth + 1).padStart(2, "0")}-${String(
    dashboard.selectedDay
  ).padStart(2, "0")}`;

  return (
    <div className={`${styles.dashboard} space-y-4 pb-[env(safe-area-inset-bottom)] sm:space-y-6 sm:pb-0`}>
      <header className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <Logo />
        <div className="proof-pill whitespace-nowrap border-proof-green/25 bg-proof-green/[0.05] px-3 py-2 text-xs font-bold text-proof-green sm:px-4">
          <Trophy size={14} className="mr-2 hidden sm:block" />
          {stats.completion >= 50 ? "Making progress today" : "Keep pushing"}
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

      <section aria-label="Progress overview" className="space-y-3 sm:hidden">
        <div className="grid grid-cols-2 gap-3">
          <article className="rounded-[22px] border border-proof-green/25 bg-proof-green/[0.035] p-4">
            <p className="text-sm font-semibold text-white/65">Completion</p>
            <div className="mt-3 flex items-end justify-between gap-2">
              <p className="text-[32px] font-black leading-none tracking-tight">{stats.completion}%</p>
              <CheckCircle2 size={22} className="shrink-0 text-proof-green" />
            </div>
          </article>
          <article className="rounded-[22px] border border-proof-green/25 bg-proof-green/[0.035] p-4">
            <p className="text-sm font-semibold text-white/65">Current streak</p>
            <div className="mt-3 flex items-end justify-between gap-2">
              <p className="flex flex-wrap items-baseline gap-x-1.5"><span className="text-[32px] font-black leading-none tracking-tight">{stats.currentStreak}</span><span className="text-sm text-white/50">days</span></p>
              <Flame size={22} className="shrink-0 text-proof-green" />
            </div>
          </article>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-white/[0.08] rounded-2xl border border-white/[0.08] bg-white/[0.025] py-3">
          {[
            { label: "Best streak", value: stats.bestStreak, color: "text-proof-amber" },
            { label: "Missed", value: stats.missed, color: "text-proof-red" },
            { label: "Completed", value: stats.completed, color: "text-proof-green" }
          ].map(({ label, value, color }) => (
            <div key={label} className="min-w-0 px-2 text-center">
              <dt className="text-[13px] font-medium text-white/55">{label}</dt>
              <dd className="mt-1 flex flex-wrap items-baseline justify-center gap-x-1"><span className={`text-2xl font-bold leading-tight ${color}`}>{value}</span>{label==="Best streak"&&<span className="text-xs text-white/45">days</span>}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="hidden grid-cols-2 gap-3 sm:grid sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Completion" value={`${stats.completion}%`} icon={CheckCircle2} tone="green" />
        <StatCard label="Current streak" value={stats.currentStreak} suffix="days" icon={Flame} tone="green" />
        <StatCard label="Best streak" value={stats.bestStreak} suffix="days" icon={Trophy} tone="amber" />
        <StatCard label="Missed today" value={stats.missed} icon={XCircle} tone="red" />
        <StatCard label="Completed today" value={stats.completed} icon={CheckCircle2} tone="green" />
      </section>

      <p className="text-sm text-white/50">Today: {progress.completed}/{progress.total} activities complete. Rest and vacation remain neutral.</p>
      {taskData.error&&<p role="alert" className="text-sm text-proof-red">{taskData.error}</p>}
      <HabitGrid dashboard={dashboard} stats={stats} />
      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Today’s tasks</h2><Link href="/todos" className="proof-action">All tasks</Link></div>{taskData.tasks.filter(t=>isTaskOnDay(t,today,timeZone)).map(task=><article key={task.id} className="proof-panel space-y-3 p-4"><p className="break-words font-bold">{task.title}</p><button className="proof-action" onClick={()=>void taskData.complete(task)}>{task.status==="completed"?"Reopen":"Complete"}</button>{task.status==="completed"&&<ProofPanel target={{taskId:task.id}}/>}</article>)}</section>
    </div>
  );
}
