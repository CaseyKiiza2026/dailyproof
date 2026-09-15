"use client";

import { useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";

interface NudgeButtonProps {
  onNudge: () => Promise<{ success: boolean; error?: string }>;
}

export function NudgeButton({ onNudge }: NudgeButtonProps) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleClick() {
    setState("sending");
    const result = await onNudge();
    if (!result.success) {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
      return;
    }
    setState("sent");
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      title={state === "sent" ? "Nudge sent" : "Nudge to log today"}
      aria-label="Nudge"
      disabled={state === "sending"}
      onClick={handleClick}
      className={`proof-focus grid h-11 w-11 shrink-0 place-items-center rounded-full border transition active:scale-90 sm:h-8 sm:w-8 ${
        state === "sent"
          ? "border-proof-green/40 bg-proof-green/10 text-proof-green"
          : state === "error"
            ? "border-proof-red/40 bg-proof-red/10 text-proof-red"
            : "border-white/[0.09] bg-white/[0.03] text-white/45 hover:border-proof-amber/35 hover:text-proof-amber"
      }`}
    >
      {state === "sending" ? <Loader2 size={14} className="animate-spin" /> : state === "sent" ? <BellRing size={14} /> : <Bell size={14} />}
    </button>
  );
}
