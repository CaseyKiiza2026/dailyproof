"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { createHabit, updateHabit, HabitInput } from "@/lib/actions/habits";
import { HABIT_CATEGORIES, Habit } from "@/lib/types";

interface HabitFormModalProps {
  habit?: Habit;
  onClose: () => void;
  onCreated: (id: string, orderIndex: number, input: HabitInput) => void;
  onUpdated: (id: string, input: HabitInput) => void;
}

export function HabitFormModal({ habit, onClose, onCreated, onUpdated }: HabitFormModalProps) {
  const isEdit = Boolean(habit);
  const [name, setName] = useState(habit?.name ?? "");
  const [category, setCategory] = useState<string>(habit?.category ?? HABIT_CATEGORIES[0]);
  const [isCore, setIsCore] = useState(habit?.isCore ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Habit name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const input: HabitInput = { name: name.trim(), category, isCore };

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
              <option key={option} value={option} className="bg-[#0a0d0b]">
                {option}
              </option>
            ))}
          </select>
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
