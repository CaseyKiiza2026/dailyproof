"use client";

import { useState } from "react";
import { ChevronDown, Flame } from "lucide-react";
import { DailySummary, HabitStatus } from "@/lib/types";
import { formatRelativeTime, formatDateKey } from "@/lib/dates";

const STATUS_CLASSES: Record<HabitStatus, string> = {
  complete: "bg-proof-green",
  missed: "bg-proof-red",
  rest: "bg-proof-amber",
  vacation: "bg-proof-violet",
  empty: "bg-white/[0.08]"
};

function initialsOf(username: string) {
  return username.slice(0, 2).toUpperCase();
}

function dayLabel(logDate: string, now: Date) {
  const today = formatDateKey(now);
  const yesterday = formatDateKey(new Date(now.getTime() - 86400000));
  if (logDate === today) return "Today";
  if (logDate === yesterday) return "Yesterday";
  return logDate;
}

export function DailySummaryCard({ summary, now }: { summary: DailySummary; now: Date }) {
  const [expanded, setExpanded] = useState(false);
  const total = summary.completeCount + summary.missedCount + summary.restCount + summary.vacationCount + summary.emptyCount;

  return (
    <article className="proof-panel p-3.5 transition hover:border-white/[0.14] hover:bg-white/[0.035]">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-proof-green/25 bg-proof-green/10 text-xs font-black text-proof-green">
          {initialsOf(summary.username)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/45">
            <span className="font-semibold text-white/65">@{summary.username}</span> completed {summary.completeCount} of {total} habits
          </p>
          <p className="mt-0.5 text-sm font-extrabold text-white">{dayLabel(summary.logDate, now)}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-proof-green/25 bg-proof-green/10 px-2.5 py-1 text-[10px] font-bold text-proof-green">
          <Flame size={11} /> {summary.streak}d streak
        </span>
      </div>

      <div className={`mt-3 flex flex-wrap items-center gap-1.5 ${expanded ? "gap-2" : ""}`}>
        {summary.statuses.map((status, index) => (
          <span key={index} className={`rounded-[4px] ${STATUS_CLASSES[status]} ${expanded ? "h-5 w-5" : "h-3.5 w-3.5"}`} />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-white/38">
        {summary.completeCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-proof-green" /> {summary.completeCount} complete
          </span>
        )}
        {summary.missedCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-proof-red" /> {summary.missedCount} missed
          </span>
        )}
        {summary.restCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-proof-amber" /> {summary.restCount} rest
          </span>
        )}
        {summary.vacationCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-proof-violet" /> {summary.vacationCount} vacation
          </span>
        )}
        {summary.emptyCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white/25" /> {summary.emptyCount} empty
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] text-white/28">{formatRelativeTime(summary.lastActivityAt, now)}</span>
        <button
          onClick={() => setExpanded((value) => !value)}
          className="proof-focus flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-white/45 transition hover:text-white/80"
        >
          {expanded ? "Hide" : "View day"} <ChevronDown size={12} className={`transition ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
    </article>
  );
}
