"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Filter, Sparkles, Check, X, Bed, Plane, Flame, Trophy, Plus, Star } from "lucide-react";
import { HabitInput } from "@/lib/actions/habits";
import { Habit, HabitStatus, HABIT_CATEGORIES } from "@/lib/types";
import { HabitStats } from "@/lib/stats";
import { formatDateKey } from "@/lib/dates";
import { useDashboardHabits } from "@/lib/hooks/use-dashboard-habits";
import { HabitFormModal } from "@/components/dashboard/habit-form-modal";
import { HabitRowMenu } from "@/components/dashboard/habit-row-menu";
import { DeleteHabitDialog } from "@/components/dashboard/delete-habit-dialog";

const statusClasses: Record<HabitStatus, string> = {
  complete: "border-proof-green/70 bg-proof-green shadow-[0_0_16px_rgba(37,216,111,.45),inset_0_1px_0_rgba(255,255,255,.35)]",
  missed: "border-proof-red/70 bg-proof-red shadow-[0_0_16px_rgba(255,85,79,.45),inset_0_1px_0_rgba(255,255,255,.35)]",
  rest: "border-proof-amber/70 bg-proof-amber shadow-[0_0_16px_rgba(245,158,11,.45),inset_0_1px_0_rgba(255,255,255,.35)]",
  vacation: "border-proof-violet/70 bg-proof-violet shadow-[0_0_16px_rgba(139,92,246,.45),inset_0_1px_0_rgba(255,255,255,.35)]",
  empty: "border-white/[0.07] bg-white/[0.045] hover:bg-white/[0.08] hover:border-white/[0.14]"
};

const statusIcons: Record<HabitStatus, typeof Check | null> = {
  complete: Check,
  missed: X,
  rest: Bed,
  vacation: Plane,
  empty: null
};

type ModalState = { mode: "create" } | { mode: "edit"; habit: Habit };

interface HabitGridProps {
  dashboard: ReturnType<typeof useDashboardHabits>;
  stats: HabitStats;
}

export function HabitGrid({ dashboard, stats }: HabitGridProps) {
  const {
    habits,
    loading,
    daysInMonth,
    viewYear,
    viewMonth,
    selectedDay,
    setSelectedDay,
    isEditableDate,
    pendingCells,
    seeding,
    updateCell,
    handleHabitCreated,
    handleHabitUpdated,
    handleHabitDeleted,
    handleSeedStarterHabits
  } = dashboard;

  const monthDays = useMemo(() => Array.from({ length: daysInMonth }, (_, index) => index + 1), [daysInMonth]);

  const [modal, setModal] = useState<ModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Habit | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    function handleClick(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterOpen]);

  const presentCategories = useMemo(
    () => HABIT_CATEGORIES.filter((category) => habits.some((h) => h.category === category)),
    [habits]
  );

  const visibleHabits = activeCategories.size === 0 ? habits : habits.filter((h) => activeCategories.has(h.category));

  function toggleCategory(category: string) {
    setActiveCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function onCreated(id: string, orderIndex: number, input: HabitInput) {
    handleHabitCreated(id, orderIndex, input);
    setModal(null);
  }

  function onUpdated(id: string, input: HabitInput) {
    handleHabitUpdated(id, input);
    setModal(null);
  }

  function onDeleted(id: string) {
    handleHabitDeleted(id);
    setDeleteTarget(null);
  }

  const showEmptyState = !loading && habits.length === 0;
  const showFilteredEmptyState = !loading && habits.length > 0 && visibleHabits.length === 0;

  const gridTemplateColumns = `170px repeat(${daysInMonth}, 22px)`;

  return (
    <section className="proof-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold">Habit Grid</h2>
            <span className="hidden rounded-full bg-proof-green/10 px-2 py-0.5 text-[10px] font-bold text-proof-green sm:inline">{stats.completion}% completion</span>
            <span className="hidden items-center gap-1 rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-white/60 sm:inline-flex"><Flame size={11} className="text-proof-amber" />{stats.currentStreak}d streak</span>
            <span className="hidden items-center gap-1 rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-white/60 sm:inline-flex"><Trophy size={11} className="text-proof-violet" />Best {stats.bestStreak}d</span>
          </div>
          <p className="mt-1 text-xs text-white/35">Tap a cell to cycle its status.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setModal({ mode: "create" })}
            className="proof-pill proof-focus h-9 gap-1 px-3 text-xs font-semibold text-proof-green transition active:scale-[0.96]"
          >
            <Plus size={14} /> Add habit
          </button>
          <button
            onClick={dashboard.goToToday}
            className="proof-pill proof-focus h-9 px-3 text-xs font-semibold transition active:scale-[0.96]"
          >
            Today
          </button>
          <div ref={filterRef} className="relative">
            <button
              aria-label="Filter habits"
              onClick={() => setFilterOpen((value) => !value)}
              className={`proof-pill proof-focus h-9 w-9 transition active:scale-[0.96] ${
                activeCategories.size > 0 ? "border-proof-green/50 text-proof-green" : ""
              }`}
            >
              <Filter size={15} />
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-xl border border-white/[0.09] bg-[#0d110f] p-2 shadow-proof-card">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-white/35">Filter by category</p>
                {presentCategories.length === 0 && <p className="px-2 py-2 text-xs text-white/40">No categories yet.</p>}
                {presentCategories.map((category) => {
                  const checked = activeCategories.has(category);
                  return (
                    <label
                      key={category}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-white/75 transition hover:bg-white/[0.06] active:bg-white/[0.1]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(category)}
                        className="proof-focus h-3.5 w-3.5 accent-proof-green"
                      />
                      {category}
                    </label>
                  );
                })}
                {activeCategories.size > 0 && (
                  <button
                    onClick={() => setActiveCategories(new Set())}
                    className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-white/45 transition hover:bg-white/[0.06] hover:text-white/70"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 170 + daysInMonth * 30 }}>
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
                  className="proof-focus h-9 rounded-full bg-proof-green px-4 text-xs font-bold text-black shadow-proof-button transition hover:brightness-110 active:scale-[0.96] disabled:opacity-60"
                >
                  {seeding ? "Adding..." : "Add starter habits"}
                </button>
                <button
                  onClick={() => setModal({ mode: "create" })}
                  className="proof-pill proof-focus h-9 px-4 text-xs font-semibold transition active:scale-[0.96]"
                >
                  Add habit
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                className="grid items-center gap-x-2 border-b border-white/[0.06] px-4 py-2.5 text-[10px] text-white/32 sm:px-5"
                style={{ gridTemplateColumns }}
              >
                <span className="sticky left-0 z-10 bg-[#0a0d0b] uppercase tracking-[.12em]">Habit</span>
                {monthDays.map((day) => (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className={`grid h-6 w-6 place-items-center rounded-full transition active:scale-90 ${selectedDay === day ? "bg-proof-green font-black text-black shadow-[0_0_20px_rgba(37,216,111,.24)]" : "hover:bg-white/[0.08] hover:text-white/80"}`}
                  >
                    {day}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="space-y-3 px-4 py-5 sm:px-5">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="grid items-center gap-x-2" style={{ gridTemplateColumns }}>
                      <div className="h-7 w-32 animate-pulse rounded-lg bg-white/[0.06]" />
                      {monthDays.map((day) => (
                        <div key={day} className="proof-grid-cell animate-pulse border-white/[0.05] bg-white/[0.03]" />
                      ))}
                    </div>
                  ))}
                </div>
              ) : showFilteredEmptyState ? (
                <div className="px-6 py-10 text-center text-xs text-white/35">No habits match the selected filters.</div>
              ) : (
                visibleHabits.map((habit) => (
                  <div
                    key={habit.id}
                    className="group grid items-center gap-x-2 border-b border-white/[0.055] px-4 py-3 last:border-0 sm:px-5"
                    style={{ gridTemplateColumns }}
                  >
                    <div className="sticky left-0 z-10 flex min-w-0 items-center gap-2 bg-[#0a0d0b]/95 pr-2 backdrop-blur-sm">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-[10px] font-bold text-white/70">{habit.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 truncate text-xs font-bold text-white/90">
                          {habit.name}
                          {habit.isCore && (
                            <span title="Core habit" className="inline-flex shrink-0 items-center text-proof-amber">
                              <Star size={9} fill="currentColor" />
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[10px] text-white/28">{habit.subtitle}</p>
                      </div>
                      <HabitRowMenu onEdit={() => setModal({ mode: "edit", habit })} onDelete={() => setDeleteTarget(habit)} />
                    </div>
                    {monthDays.map((day) => {
                      const dateKey = formatDateKey(new Date(viewYear, viewMonth, day));
                      const status = habit.logsByDate[dateKey] ?? "empty";
                      const StatusIcon = statusIcons[status];
                      const editable = isEditableDate(day);
                      const pending = pendingCells.has(`${habit.id}:${dateKey}`);
                      return (
                        <button
                          aria-label={`${habit.name}, day ${day}: ${status}`}
                          key={`${habit.id}-${day}`}
                          disabled={!editable || pending}
                          onClick={() => updateCell(habit.id, day)}
                          className={`proof-grid-cell proof-focus grid place-items-center transition active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${statusClasses[status]} ${selectedDay === day ? "ring-2 ring-white/25 ring-offset-2 ring-offset-[#0a0d0b]" : ""}`}
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
          onCreated={onCreated}
          onUpdated={onUpdated}
        />
      )}

      {deleteTarget && (
        <DeleteHabitDialog
          habitId={deleteTarget.id}
          habitName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDeleted={onDeleted}
        />
      )}
    </section>
  );
}
