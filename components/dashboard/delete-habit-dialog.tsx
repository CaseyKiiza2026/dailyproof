"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { deleteHabit } from "@/lib/actions/habits";

interface DeleteHabitDialogProps {
  habitId: string;
  habitName: string;
  onClose: () => void;
  onDeleted: (habitId: string) => void;
}

export function DeleteHabitDialog({ habitId, habitName, onClose, onDeleted }: DeleteHabitDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    const result = await deleteHabit(habitId);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onDeleted(habitId);
  }

  return (
    <Modal title="Delete habit" onClose={onClose}>
      <p className="text-sm text-white/70">
        Delete <span className="font-bold text-white/90">{habitName}</span>? This will also delete all its logged history.
      </p>

      {error && <p className="mt-3 text-xs font-semibold text-proof-red">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="proof-pill proof-focus h-9 px-4 text-xs font-semibold">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={submitting}
          className="proof-focus h-9 rounded-full bg-proof-red px-4 text-xs font-bold text-white transition disabled:opacity-60"
        >
          {submitting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </Modal>
  );
}
