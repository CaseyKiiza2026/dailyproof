"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter, Sparkles, Check, X, Bed, Plane, Flame, Trophy, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { upsertHabitLog } from "@/lib/actions/habit-logs";
import { seedStarterHabits, HabitInput } from "@/lib/actions/habits";
import { Habit, HabitStatus } from "@/lib/types";
import { HabitFormModal } from "@/components/dashboard/habit-form-modal";
import { HabitRowMenu } from "@/components/dashboard/habit-row-menu";
import { DeleteHabitDialog } from "@/components/dashboard/delete-habit-dialog";

const statusClasses: Record<HabitStatus, string> = {
  complete: "border-proof-green/70 bg-proof-green shadow-[0_0_16px_rgba(37,216,111,.45),inset_0_1px_0_rgba(255,255,255,.35)]",
  missed: "border-proof-red/70 bg-proof-red shadow-[0_0_16px_rgba(255,85,79,.45),inset_0_1px_0_rgba(255,255,255,.35)]",
  rest: "border-proof-amber/70 bg-proof-amber shadow-[0_0_16px_rgba(245,158,11,.45),inset_0_1px_0_rgba(255,255,255,.35)]",
  vacation: "border-proof-violet/70 bg-proof-violet shadow-[0_0_16px_rgba(139,92,246,.45),inset_0_1px_0_rgba(255,255,255,.35)]",
  empty: "border-white/[0.07] bg-white/[0.045]"
};

const statusIcons: Record<HabitStatus, typeof Check | null> = {
  complete: Check,
  missed: X,
  rest: Bed,
  vacation: Plane,
  empty: null
};

const cycle: HabitStatus[] = ["empty", "complete", "missed", "rest", "vacation"];

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function habitIcon(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function cellKey(habitId: string, day: number) {
  return `${habitId}:${day}`;
}

type DayType = "success" | "fail" | "rest" | "vacation" | "empty";

// A day is "success"/"fail" based on the complete-vs-missed ratio among that day's
// logged habits (rest/vacation excluded from that ratio, same as before). If nothing
// was logged as complete/missed, the day falls back to "rest" or "vacation" when at
// least one habit carries that status, or "empty" if nothing was logged at all.
function classifyDay(habits: Habit[], day: number): DayType {
  let complete = 0;
  let missed = 0;
  let rest = 0;
  let vacation = 0;

  for (const habit of habits) {
    const status = habit.statuses[day - 1] ?? "empty";
    if (status === "complete") complete++;
    else if (status === "missed") missed++;
    else if (status === "rest") rest++;
    else if (status === "vacation") vacation++;
  }

  const logged = complete + missed;
  if (logged > 0) return complete / logged >= 0.5 ? "success" : "fail";
  if (vacation > 0) return "vacation";
  if (rest > 0) return "rest";
  return "empty";
}

// Forward simulation from day 1 through `throughDay`. Rest and vacation days don't
// break a streak outright: a 1st consecutive rest day is neutral, a 2nd knocks the
// streak down by 1 (without zeroing it), and a 3rd breaks it. Vacation days freeze
// the streak for up to 7 days in a row before an 8th breaks it. `best` tracks the
// highest value the streak reached at any point, even if it's since been reduced.
function simulateStreak(habits: Habit[], throughDay: number): { streak: number; best: number } {
  let streak = 0;
  let best = 0;
  let consecutiveRest = 0;
  let consecutiveVacation = 0;

  for (let day = 1; day <= throughDay; day++) {
    const type = classifyDay(habits, day);

    switch (type) {
      case "success":
        streak += 1;
        consecutiveRest = 0;
        consecutiveVacation = 0;
        break;
      case "rest":
        consecutiveVacation = 0;
        consecutiveRest += 1;
        if (consecutiveRest === 2) streak = Math.max(0, streak - 1);
        else if (consecutiveRest >= 3) streak = 0;
        break;
      case "vacation":
        consecutiveRest = 0;
        consecutiveVacation += 1;
        if (consecutiveVacation >= 8) streak = 0;
        break;
      case "fail":
      case "empty":
        streak = 0;
        consecutiveRest = 0;
        consecutiveVacation = 0;
        break;
    }

    best = Math.max(best, streak);
  }

  return { streak, best };
}

function computeCurrentStreak(habits: Habit[], today: number): number {
  const throughDay = classifyDay(habits, today) === "empty" ? today - 1 : today;
  return simulateStreak(habits, Math.max(throughDay, 0)).streak;
}

function computeBestStreak(habits: Habit[], today: number): number {
  return simulateStreak(habits, today).best;
}

function computeCompletion(habits: Habit[], today: number): number {
  let complete = 0;
  let missed = 0;
  for (const habit of habits) {
    for (let day = 1; day <= today; day++) {
      const status = habit.statuses[day - 1] ?? "empty";
      if (status === "complete") complete++;
      else if (status === "missed") missed++;
    }
  }
  const denominator = complete + missed;
  return denominator === 0 ? 0 : Math.round((complete / denominator) * 100);
}

type ModalState = { mode: "create" } | { mode: "edit"; habit: Habit };

export function HabitGrid() {
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDay = now.getDate();
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterdayDay = yesterdayDate.getMonth() === month ? yesterdayDate.getDate() : null;

  const monthDays = useMemo(() => Array.from({ length: daysInMonth }, (_, index) => index + 1), [daysInMonth]);
  const visibleDays = monthDays.slice(0, 18);

  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(todayDay);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Habit | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const supabase = createClient();

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setHabits([]);
          setLoading(false);
        }
        return;
      }

      const { data: habitRows } = await supabase
        .from("habits")
        .select("id, name, category, order_index, is_core")
        .eq("user_id", user.id)
        .order("order_index", { ascending: true });

      const habitIds = (habitRows ?? []).map((h) => h.id);
      const monthStart = formatDateKey(new Date(year, month, 1));
      const monthEnd = formatDateKey(new Date(year, month, daysInMonth));

      const { data: logRows } =
        habitIds.length > 0
          ? await supabase
              .from("habit_logs")
              .select("habit_id, log_date, status")
              .in("habit_id", habitIds)
              .gte("log_date", monthStart)
              .lte("log_date", monthEnd)
          : { data: [] };

      const merged: Habit[] = (habitRows ?? []).map((row) => {
        const statuses: HabitStatus[] = Array.from({ length: daysInMonth }, () => "empty");
        for (const log of logRows ?? []) {
          if (log.habit_id !== row.id) continue;
          const dayOfMonth = Number(log.log_date.slice(8, 10));
          statuses[dayOfMonth - 1] = log.status as HabitStatus;
        }
        return {
          id: row.id,
          name: row.name,
          category: row.category,
          subtitle: row.category,
          icon: habitIcon(row.name),
          statuses,
          isCore: row.is_core,
          orderIndex: row.order_index
        };
      });

      if (!cancelled) {
        setHabits(merged);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [year, month, daysInMonth]);

  const completion = useMemo(() => computeCompletion(habits, todayDay), [habits, todayDay]);
  const currentStreak = useMemo(() => computeCurrentStreak(habits, todayDay), [habits, todayDay]);
  const bestStreak = useMemo(() => computeBestStreak(habits, todayDay), [habits, todayDay]);

  async function updateCell(habitId: string, dayIndex: number, day: number) {
    const editable = day === todayDay || day === yesterdayDay;
    if (!editable) return;

    const key = cellKey(habitId, day);
    if (pendingCells.has(key)) return;

    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;

    const previousStatus = habit.statuses[dayIndex] ?? "empty";
    const nextStatus = cycle[(cycle.indexOf(previousStatus) + 1) % cycle.length];

    setPendingCells((current) => new Set(current).add(key));
    setHabits((current) =>
      current.map((h) => {
        if (h.id !== habitId) return h;
        const statuses = [...h.statuses];
        statuses[dayIndex] = nextStatus;
        return { ...h, statuses };
      })
    );

    const logDate = formatDateKey(new Date(year, month, day));
    const result = await upsertHabitLog(habitId, logDate, nextStatus);

    if (!result.success) {
      console.error(`Failed to save habit log (habit ${habitId}, ${logDate}, status ${nextStatus}):`, result.error);
      setHabits((current) =>
        current.map((h) => {
          if (h.id !== habitId) return h;
          const statuses = [...h.statuses];
          statuses[dayIndex] = previousStatus;
          return { ...h, statuses };
        })
      );
    }

    setPendingCells((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  function handleHabitCreated(id: string, orderIndex: number, input: HabitInput) {
    setHabits((current) => [
      ...current,
      {
        id,
        name: input.name,
        category: input.category,
        subtitle: input.category,
        icon: habitIcon(input.name),
        statuses: Array.from({ length: daysInMonth }, () => "empty"),
        isCore: input.isCore,
        orderIndex
      }
    ]);
    setModal(null);
  }

  function handleHabitUpdated(id: string, input: HabitInput) {
    setHabits((current) =>
      current.map((h) =>
        h.id === id
          ? { ...h, name: input.name, category: input.category, subtitle: input.category, icon: habitIcon(input.name), isCore: input.isCore }
          : h
      )
    );
    setModal(null);
  }

  function handleHabitDeleted(id: string) {
    setHabits((current) => current.filter((h) => h.id !== id));
    setDeleteTarget(null);
  }

  async function handleSeedStarterHabits() {
    setSeeding(true);
    const result = await seedStarterHabits();
    setSeeding(false);
    if (!result.success) return;

    setHabits(
      result.data.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        subtitle: row.category,
        icon: habitIcon(row.name),
        statuses: Array.from({ length: daysInMonth }, () => "empty"),
        isCore: true,
        orderIndex: row.order_index
      }))
    );
  }

  const showEmptyState = !loading && habits.length === 0;

  return (
    <section className="proof-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-4 sm:px-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold">Habit Grid</h2>
            <span className="hidden rounded-full bg-proof-green/10 px-2 py-0.5 text-[10px] font-bold text-proof-green sm:inline">{completion}% completion</span>
            <span className="hidden items-center gap-1 rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-white/60 sm:inline-flex"><Flame size={11} className="text-proof-amber" />{currentStreak}d streak</span>
            <span className="hidden items-center gap-1 rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-white/60 sm:inline-flex"><Trophy size={11} className="text-proof-violet" />Best {bestStreak}d</span>
          </div>
          <p className="mt-1 text-xs text-white/35">Tap a cell to cycle its status.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal({ mode: "create" })} className="proof-pill proof-focus h-9 gap-1 px-3 text-xs font-semibold text-proof-green">
            <Plus size={14} /> Add habit
          </button>
          <button onClick={() => setSelectedDay(todayDay)} className="proof-pill proof-focus h-9 px-3 text-xs font-semibold">Today</button>
          <button aria-label="Filter habits" className="proof-pill proof-focus h-9 w-9"><Filter size={15} /></button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[805px]">
          {showEmptyState ? (
            <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-white/40">
                <Sparkles size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-white/80">No habits yet</p>
                <p className="mt-1 text-xs text-white/35">Add your first habit, or start with a curated set.</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={handleSeedStarterHabits}
                  disabled={seeding}
                  className="proof-focus h-9 rounded-full bg-proof-green px-4 text-xs font-bold text-black shadow-proof-button transition disabled:opacity-60"
                >
                  {seeding ? "Adding..." : "Add starter habits"}
                </button>
                <button onClick={() => setModal({ mode: "create" })} className="proof-pill proof-focus h-9 px-4 text-xs font-semibold">
                  Add habit
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[150px_repeat(18,22px)] items-center gap-x-2 border-b border-white/[0.06] px-4 py-2.5 text-[10px] text-white/32 sm:grid-cols-[178px_repeat(18,22px)] sm:px-5">
                <span className="uppercase tracking-[.12em]">Habit</span>
                {visibleDays.map((day) => (
                  <button key={day} onClick={() => setSelectedDay(day)} className={`grid h-6 w-6 place-items-center rounded-full transition ${selectedDay === day ? "bg-proof-green font-black text-black shadow-[0_0_20px_rgba(37,216,111,.24)]" : "hover:bg-white/[0.05]"}`}>{day}</button>
                ))}
              </div>

              {loading ? (
                <div className="space-y-3 px-4 py-5 sm:px-5">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="grid grid-cols-[150px_repeat(18,22px)] items-center gap-x-2 sm:grid-cols-[178px_repeat(18,22px)]">
                      <div className="h-7 w-32 animate-pulse rounded-lg bg-white/[0.06]" />
                      {visibleDays.map((day) => (
                        <div key={day} className="proof-grid-cell animate-pulse border-white/[0.05] bg-white/[0.03]" />
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                habits.map((habit) => (
                  <div key={habit.id} className="group grid grid-cols-[150px_repeat(18,22px)] items-center gap-x-2 border-b border-white/[0.055] px-4 py-3 last:border-0 sm:grid-cols-[178px_repeat(18,22px)] sm:px-5">
                    <div className="sticky left-0 z-10 flex min-w-0 items-center gap-2 bg-[#0a0d0b]/95 pr-2 backdrop-blur-sm">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-[10px] font-bold text-white/70">{habit.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-white/90">{habit.name}</p>
                        <p className="truncate text-[10px] text-white/28">{habit.subtitle}</p>
                      </div>
                      <HabitRowMenu onEdit={() => setModal({ mode: "edit", habit })} onDelete={() => setDeleteTarget(habit)} />
                    </div>
                    {visibleDays.map((day, dayIndex) => {
                      const status = habit.statuses[dayIndex] ?? "empty";
                      const StatusIcon = statusIcons[status];
                      const editable = day === todayDay || day === yesterdayDay;
                      const pending = pendingCells.has(cellKey(habit.id, day));
                      return (
                        <button
                          aria-label={`${habit.name}, day ${day}: ${status}`}
                          key={`${habit.id}-${day}`}
                          disabled={!editable || pending}
                          onClick={() => updateCell(habit.id, dayIndex, day)}
                          className={`proof-grid-cell proof-focus grid place-items-center disabled:cursor-not-allowed disabled:opacity-40 ${statusClasses[status]} ${selectedDay === day ? "ring-2 ring-white/25 ring-offset-2 ring-offset-[#0a0d0b]" : ""}`}
                        >
                          {StatusIcon && <StatusIcon size={13} strokeWidth={3} className="text-white" />}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>

      {!showEmptyState && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.07] px-4 py-3 text-[10px] text-white/38 sm:px-5">
          <span className="mr-1 inline-flex items-center gap-1.5 text-white/52"><Sparkles size={12} className="text-proof-green" /> Status</span>
          {(["complete", "missed", "rest", "vacation", "empty"] as HabitStatus[]).map((status) => {
            const StatusIcon = statusIcons[status];
            return (
              <span key={status} className="inline-flex items-center gap-1.5 capitalize">
                <span className={`grid h-2.5 w-2.5 place-items-center rounded-[3px] border ${statusClasses[status]}`}>
                  {StatusIcon && <StatusIcon size={8} strokeWidth={3.5} className="text-white" />}
                </span>
                {status}
              </span>
            );
          })}
        </div>
      )}

      {modal && (
        <HabitFormModal
          habit={modal.mode === "edit" ? modal.habit : undefined}
          onClose={() => setModal(null)}
          onCreated={handleHabitCreated}
          onUpdated={handleHabitUpdated}
        />
      )}

      {deleteTarget && (
        <DeleteHabitDialog
          habitId={deleteTarget.id}
          habitName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleHabitDeleted}
        />
      )}
    </section>
  );
}
