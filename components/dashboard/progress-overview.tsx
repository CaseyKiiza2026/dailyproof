"use client";

import Link from "next/link";
import { Check, Flame } from "lucide-react";
import { useUserClock } from "@/components/layout/user-clock";
import { useTasks } from "@/lib/hooks/use-tasks";
import type { Habit } from "@/lib/types";
import type { HabitStats } from "@/lib/stats";
import { dailyProgress, isTaskOnDay, periodProgress } from "@/lib/daily-progress";
import { dateKeyRange, formatDateKey } from "@/lib/dates";
import { ProofPanel } from "@/components/proofs/proof-panel";
import { ProgressShield } from "@/components/ui/progress-shield";

export function ProgressOverview({ habits, stats, habitsReady, ready }: { habits: Habit[]; stats: HabitStats; habitsReady: boolean; ready: boolean }) {
  const { today, todayDate, timeZone } = useUserClock();
  const tasks = useTasks();
  const progress = dailyProgress(habits, tasks.tasks, today, timeZone);
  const start = new Date(todayDate);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days = dateKeyRange(start, todayDate);
  const week = periodProgress(habits, tasks.tasks, days, timeZone);
  const focus = tasks.tasks.filter(task => isTaskOnDay(task, today, timeZone));
  return <section className="home-overview" aria-label="Progress overview">
    <article className="proof-panel today-card">
      <ProgressShield completion={ready ? progress.completion : 0} />
      <p className="text-sm text-white/65">Today</p>
      <p className="progress-number">{ready ? `${progress.completion}%` : "—"}</p>
      <p className="text-sm text-white/65">{ready ? `Today: ${progress.completed}/${progress.total} activities complete.` : "Today's totals are not yet available."}</p>
      <div className="progress-track" role="progressbar" aria-label="Today's completion" aria-valuenow={ready ? progress.completion : undefined} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${ready ? progress.completion : 0}%` }} /></div>
      <div className="mt-5 flex items-center justify-between gap-2 text-xs"><span className="inline-flex items-center gap-2"><Flame size={15} className="text-proof-green" />{habitsReady ? `${stats.currentStreak}-day streak` : "—"}</span><span className="text-white/55">{ready ? `${progress.incomplete} remaining` : ""}</span></div>
    </article>
    <article className="proof-panel focus-card">
      <div className="flex items-center justify-between gap-3"><h2>Today’s focus</h2><Link href="/todos" className="text-xs text-proof-green proof-focus">All tasks</Link></div>
      {!tasks.ready && <div aria-label="Tasks not yet available" className="mt-5 h-24 animate-pulse rounded-xl bg-white/5" />}
      {tasks.ready && !focus.length && <p className="py-6 text-sm text-white/55">No tasks due today.</p>}
      {focus.map(task => <div key={task.id} className="focus-task">
        <div className="flex items-center gap-3"><button disabled={tasks.busy} className="focus-check proof-focus" aria-label={`${task.status === "completed" ? "Reopen" : "Complete"} ${task.title}`} aria-pressed={task.status === "completed"} onClick={() => void tasks.complete(task)}>{task.status === "completed" && <Check size={15} />}</button><span className="text-sm font-semibold break-words">{task.title}</span></div>
        {task.status === "completed" && <details className="mt-2 text-xs text-white/60"><summary>Proof</summary><ProofPanel target={{ taskId: task.id }} /></details>}
      </div>)}
    </article>
    <article className="proof-panel week-card">
      <h2>This week</h2><div className="mt-3 flex flex-wrap items-baseline gap-2"><strong className="text-3xl">{ready ? `${week.completion}%` : "—"}</strong><span className="text-xs text-white/55">{ready ? `${week.completed} of ${week.total} activities` : ""}</span></div>
      <div className="week-bars">{Array.from({length:7},(_,i)=>{const day=new Date(start);day.setDate(start.getDate()+i);const key=formatDateKey(day);const available=ready&&key<=today;const value=available?dailyProgress(habits,tasks.tasks,key,timeZone).completion:0;return <div key={key} title={available?`${key}: ${value}% complete`:`${key}: upcoming`}><span style={{height:`${Math.max(8,value*.56)}px`}} data-upcoming={!available}/><small>{['M','T','W','T','F','S','S'][i]}</small></div>;})}</div>
      <details className="mt-3 border-t border-white/10 pt-3 text-xs text-white/60"><summary>More stats</summary><dl className="mt-3 space-y-2"><div>Best streak: {habitsReady ? stats.bestStreak : "—"} days</div><div>Missed today: {ready ? progress.missed : "—"}</div><div>Completed today: {ready ? progress.completed : "—"}</div></dl></details>
    </article>
  </section>;
}
