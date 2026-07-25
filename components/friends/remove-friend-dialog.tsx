"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";

interface RemoveFriendDialogProps {
  username: string;
  isPendingOutgoing: boolean;
  onClose: () => void;
  onConfirm: () => Promise<{ success: boolean; error?: string }>;
}

export function RemoveFriendDialog({ username, isPendingOutgoing, onClose, onConfirm }: RemoveFriendDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    const result = await onConfirm();
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    onClose();
  }

  return (
    <Modal title={isPendingOutgoing ? "Cancel request" : "Unfriend"} onClose={onClose}>
      <p className="text-sm text-white/70">
        {isPendingOutgoing ? (
          <>
            Cancel your pending request to <span className="font-bold text-white/90">@{username}</span>?
          </>
        ) : (
          <>
            Remove <span className="font-bold text-white/90">@{username}</span> from your circle?
          </>
        )}
      </p>

      {error && <p className="mt-3 text-xs font-semibold text-proof-red">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="proof-pill proof-focus h-9 px-4 text-xs font-semibold">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className="proof-focus h-9 rounded-full bg-proof-red px-4 text-xs font-bold text-white transition disabled:opacity-60"
        >
          {submitting ? "Removing..." : isPendingOutgoing ? "Cancel request" : "Unfriend"}
        </button>
      </div>
    </Modal>
  );
}
