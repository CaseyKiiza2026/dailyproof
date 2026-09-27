"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { createHabit, updateHabit, HabitInput } from "@/lib/actions/habits";
import { ALL_SCHEDULED_DAYS, HABIT_CATEGORIES, Habit, SCHEDULE_DAY_LABELS } from "@/lib/types";

interface HabitFormModalProps {
  habit?: Habit;
  onClose: () => void;
  onCreated: (id: string, orderIndex: number, input: HabitInput) => void;
  onUpdated: (id: string, input: HabitInput) => void;
}

type ScheduleMode = "daily" | "custom";

function isDailySchedule(days: number[]) {
  return ALL_SCHEDULED_DAYS.every((d) => days.includes(d)) && days.length === 7;
}

export function HabitFormModal({ habit, onClose, onCreated, onUpdated }: HabitFormModalProps) {
  const isEdit = Boolean(habit);
  const [name, setName] = useState(habit?.name ?? "");
  const [category, setCategory] = useState<string>(habit?.category ?? HABIT_CATEGORIES[0]);
  const [isCore, setIsCore] = useState(habit?.isCore ?? true);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(
    habit && !isDailySchedule(habit.scheduledDays) ? "custom" : "daily"
  );
  // New habit: start with nothing picked, so switching to Custom is a blank
  // slate the user taps days onto — not all 7 pre-checked days to un-tap.
  // Editing a habit that's currently Daily: pre-check all 7 (narrowing down
  // from "every day" reads naturally as unchecking, unlike starting fresh).
  // Editing a habit that's already Custom: preserve its existing selection.
  const [customDays, setCustomDays] = useState<Set<number>>(() => {
    if (!habit) return new Set();
    return new Set(isDailySchedule(habit.scheduledDays) ? ALL_SCHEDULED_DAYS : habit.scheduledDays);
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheduledDays = scheduleMode === "daily" ? [...ALL_SCHEDULED_DAYS] : Array.from(customDays).sort();

  function toggleDay(day: number) {
    setCustomDays((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Habit name is required.");
      return;
    }
    if (scheduleMode === "custom" && customDays.size === 0) {
      setError("Select at least one day.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const input: HabitInput = { name: name.trim(), category, isCore, scheduledDays };

    if (isEdit && habit) {
      const result = await updateHabit(habit.id, input);
      setSubmitting(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onUpdated(habit.id, input);
    } else {
      const result = await createHabit(input);
      setSubmitting(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onCreated(result.data.id, result.data.orderIndex, input);
    }
  }

  return (
    <Modal title={isEdit ? "Edit habit" : "Add habit"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="habit-name" className="proof-kicker mb-1.5 block">
            Habit name
          </label>
          <input
            id="habit-name"
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Read for 20 minutes"
            className="proof-focus h-10 w-full rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 text-sm text-white placeholder:text-white/25"
          />
        </div>

        <div>
          <label htmlFor="habit-category" className="proof-kicker mb-1.5 block">
            Category
          </label>
          <select
            id="habit-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="proof-focus h-10 w-full rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 text-sm text-white"
          >
            {HABIT_CATEGORIES.map((option) => (
              <option key={option} value={option} className="bg-proof-panel">
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="proof-kicker mb-1.5 block">Schedule</label>
          <div className="flex rounded-full border border-white/[0.09] bg-white/[0.025] p-1">
            {(["daily", "custom"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setScheduleMode(mode)}
                className={`proof-focus flex-1 rounded-full py-2 text-xs font-bold capitalize transition ${
                  scheduleMode === mode ? "bg-white/[0.08] text-white" : "text-white/35"
                }`}
              >
                {mode === "daily" ? "Daily" : "Custom days"}
              </button>
            ))}
          </div>

          {scheduleMode === "custom" && (
            <div className="mt-3">
              <div className="flex justify-between gap-1.5">
                {ALL_SCHEDULED_DAYS.map((day) => {
                  const active = customDays.has(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      aria-pressed={active}
                      className={`proof-focus grid h-9 w-9 place-items-center rounded-full border text-xs font-bold transition ${
                        active
                          ? "border-proof-green/55 bg-proof-green/15 text-proof-green"
                          : "border-white/[0.09] bg-white/[0.02] text-white/35 hover:border-white/[0.18] hover:text-white/60"
                      }`}
                    >
                      {SCHEDULE_DAY_LABELS[day]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] font-semibold text-white/35">
                {customDays.size} day{customDays.size === 1 ? "" : "s"} selected
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <label htmlFor="habit-core" className="proof-kicker">
            Is this a core habit?
          </label>
          <button
            id="habit-core"
            type="button"
            role="switch"
            aria-checked={isCore}
            onClick={() => setIsCore((value) => !value)}
            className={`proof-focus relative h-6 w-11 shrink-0 rounded-full border transition ${
              isCore ? "border-proof-green/55 bg-proof-green/70" : "border-white/[0.09] bg-white/[0.06]"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                isCore ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        {error && <p className="text-xs font-semibold text-proof-red">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="proof-pill proof-focus h-9 px-4 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="proof-focus h-9 rounded-full bg-proof-green px-4 text-xs font-bold text-black shadow-proof-button transition disabled:opacity-60"
          >
            {submitting ? "Saving..." : isEdit ? "Save changes" : "Add habit"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
