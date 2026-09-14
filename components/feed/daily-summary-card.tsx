"use client";

import { useState } from "react";
import { Bed, Check, ChevronDown, Flame, Plane, X } from "lucide-react";
import { DailySummary, HabitStatus } from "@/lib/types";
import { formatRelativeTime, parseDateKey } from "@/lib/dates";
import { shiftDateKey } from "@/lib/timezone";
import { useActivityHistory } from "@/lib/hooks/use-activity-history";

const STATUS_CLASSES: Record<HabitStatus, string> = {
  complete: "bg-proof-green",
  missed: "bg-proof-red",
  rest: "bg-proof-amber",
  vacation: "bg-proof-violet",
  empty: "bg-white/[0.08]"
};

const STATUS_CHIP_CLASSES: Record<HabitStatus, string> = {
  complete: "border-proof-green/30 bg-proof-green/10 text-proof-green",
  missed: "border-proof-red/30 bg-proof-red/10 text-proof-red",
  rest: "border-proof-amber/30 bg-proof-amber/10 text-proof-amber",
  vacation: "border-proof-violet/30 bg-proof-violet/10 text-proof-violet",
  empty: "border-white/[0.08] bg-white/[0.03] text-white/35"
};

const STATUS_ICONS: Record<HabitStatus, typeof Check | null> = {
  complete: Check,
  missed: X,
  rest: Bed,
  vacation: Plane,
  empty: null
};

function initialsOf(username: string) {
  return username.slice(0, 2).toUpperCase();
}

function dayLabel(logDate: string, today: string) {
  const yesterday = shiftDateKey(today, -1);
  if (logDate === today) return "Today";
  if (logDate === yesterday) return "Yesterday";
  return parseDateKey(logDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DailySummaryCard({ summary, now }: { summary: DailySummary; now: Date }) {
  const [expanded, setExpanded] = useState(false);
  const activity = useActivityHistory();
  const total = summary.totalCount;

  // Always anchored on real "today", not summary.logDate — a Yesterday card's
  // "View activity" must show the same today-through-6-days-ago range as the
  // Today card's, not shift back a day, so the two standalone cards and the
  // history panel never disagree about what "the last 7 days" means.
  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next) activity.load(summary.userId, summary.todayKey);
  }

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
          <p className="mt-0.5 text-sm font-extrabold text-white">{dayLabel(summary.logDate, summary.todayKey)} · {summary.completion}% completion</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-proof-green/25 bg-proof-green/10 px-2.5 py-1 text-[10px] font-bold text-proof-green">
          <Flame size={11} /> {summary.streak}d streak
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {summary.statuses.map((entry, index) => (
          <span key={index} title={entry.habitName} className={`h-3.5 w-3.5 rounded-[4px] ${STATUS_CLASSES[entry.status]}`} />
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
          onClick={handleToggle}
          className="proof-focus flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-white/45 transition hover:text-white/80"
        >
          {expanded ? "Hide" : "View activity"} <ChevronDown size={12} className={`transition ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2.5 border-t border-white/[0.06] pt-3">
          {activity.loading && <p className="text-center text-[11px] text-white/35">Loading last 7 days…</p>}
          {activity.error && <p role="alert" className="text-xs text-proof-red">{activity.error}</p>}
          {!activity.loading &&
            activity.days?.map((day) => (
              <div key={day.logDate} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-white/70">{dayLabel(day.logDate, summary.todayKey)}</p>
                  <p className="text-[10px] text-white/35">
                    {day.completeCount}/{day.totalCount} complete · {day.completion}%
                  </p>
                </div>
                {!day.detailsVisible || !summary.detailsVisible ? (
                  <p className="mt-2 text-[10px] text-white/35">Summary-only activity.</p>
                ) : day.statuses.length === 0 ? (
                  <p className="mt-2 text-[10px] text-white/25">Nothing scheduled on this day.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {day.statuses.map((entry, index) => {
                      const Icon = STATUS_ICONS[entry.status];
                      return (
                        <span
                          key={index}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${STATUS_CHIP_CLASSES[entry.status]}`}
                        >
                          {Icon && <Icon size={10} strokeWidth={3} />}
                          {entry.habitName}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </article>
  );
}
