"use client";

import { useMemo, useState } from "react";
import { Flame, Plus } from "lucide-react";
import { YearHeatmap } from "@/components/year/year-heatmap";
import { useHabitsData } from "@/lib/hooks/use-habits-data";
import { useHabitStats } from "@/lib/hooks/use-habit-stats";
import { dateKeyRange, monthDateKeys } from "@/lib/dates";
import { HabitFormModal } from "@/components/dashboard/habit-form-modal";

export default function YearPage() {
  const { habits, earliestLogDate, handleHabitCreated } = useHabitsData();
  const [addHabitOpen, setAddHabitOpen] = useState(false);
  const realNow = useMemo(() => new Date(), []);
  const year = realNow.getFullYear();

  // Same scope as the Dashboard's default (unbrowsed) view: current month for
  // completion/missed/completed, full history through real today for streaks —
  // so these numbers can never drift from what the Dashboard shows by default.
  const monthlyDateKeys = useMemo(
    () => monthDateKeys(realNow.getFullYear(), realNow.getMonth(), realNow.getDate()),
    [realNow]
  );
  const streakDateKeys = useMemo(() => {
    const start = earliestLogDate ? new Date(earliestLogDate) : realNow;
    return dateKeyRange(start, realNow);
  }, [earliestLogDate, realNow]);

  const yearDateKeys = useMemo(() => dateKeyRange(new Date(year, 0, 1), realNow), [year, realNow]);
  const stats = useHabitStats(habits, monthlyDateKeys, streakDateKeys);

  // "Days tracked" = days with any log at all (complete/missed/rest/vacation) —
  // distinct from "Completed" (successful days only, Fix 1). Surfaced explicitly
  // in the writeup since the original mock number didn't make this distinction.
  const daysTracked = useMemo(() => {
    let tracked = 0;
    for (const dateKey of yearDateKeys) {
      const hasLog = habits.some((h) => (h.logsByDate[dateKey] ?? "empty") !== "empty");
      if (hasLog) tracked++;
    }
    return tracked;
  }, [habits, yearDateKeys]);

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-5xl font-black tracking-[-0.06em] sm:text-6xl">{year}</h1>
        <button
          aria-label="Add habit"
          title="Add habit"
          onClick={() => setAddHabitOpen(true)}
          className="proof-focus grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.09] bg-white/[0.025] text-proof-green transition hover:bg-proof-green/[0.08] active:scale-95"
        >
          <Plus size={19} />
        </button>
      </header>

      {addHabitOpen && (
        <HabitFormModal
          onClose={() => setAddHabitOpen(false)}
          onCreated={(id, orderIndex, input) => {
            handleHabitCreated(id, orderIndex, input);
            setAddHabitOpen(false);
          }}
          onUpdated={() => setAddHabitOpen(false)}
        />
      )}

      <section className="proof-panel overflow-hidden p-5 sm:p-7">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="text-sm text-white/40">Year to date</p>
            <p className="mt-3 text-5xl font-black tracking-[-0.06em]">
              {daysTracked} <span className="text-sm font-normal tracking-normal text-white/30">days tracked</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-white/40">Best streak</p>
            <p className="mt-3 text-5xl font-black tracking-[-0.06em]">
              {stats.bestStreak} <span className="text-sm font-normal tracking-normal text-white/30">days</span>
            </p>
          </div>
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-5 text-sm">
          <span className="inline-flex items-center gap-2 font-bold text-proof-green">
            <Flame size={20} className="fill-orange-500 text-orange-500" />
            {stats.currentStreak} day current streak
          </span>
          <span className="text-white/25">•</span>
          <span className="text-white/35">{stats.completion}% completion</span>
        </div>
      </section>

      <YearHeatmap habits={habits} year={year} realNow={realNow} />
    </div>
  );
}
