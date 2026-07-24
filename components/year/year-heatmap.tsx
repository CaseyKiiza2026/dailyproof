"use client";

import { useEffect, useRef, useState } from "react";
import { Habit } from "@/lib/types";
import { formatDateKey } from "@/lib/dates";
import { DayCell, HeatmapTone, MonthCell, useDailyYearCells, useMonthlyYearCells } from "@/lib/hooks/use-year-heatmap";

const TONE_CLASS: Record<HeatmapTone, string> = {
  empty: "bg-white/[0.05]",
  "success-1": "bg-emerald-950",
  "success-2": "bg-emerald-800",
  "success-3": "bg-emerald-600",
  "success-4": "bg-proof-green",
  fail: "bg-proof-red/75",
  rest: "bg-proof-amber/80",
  vacation: "bg-proof-violet/75"
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

interface YearHeatmapProps {
  habits: Habit[];
  year: number;
  realNow: Date;
}

export function YearHeatmap({ habits, year, realNow }: YearHeatmapProps) {
  const [mode, setMode] = useState<"monthly" | "weekly">("weekly");
  const dailyCells = useDailyYearCells(habits, year, realNow);
  const monthlyCells = useMonthlyYearCells(habits, year, realNow);
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);
  const scrollToTodayOnMount = useRef(false);

  const columns = dailyCells.length / 7;

  const monthColumnStart = MONTH_NAMES.map((_, month) => {
    const index = dailyCells.findIndex((cell) => cell?.dateKey === formatDateKey(new Date(year, month, 1)));
    return index === -1 ? null : Math.floor(index / 7) + 1;
  });

  useEffect(() => {
    if (mode === "weekly" && scrollToTodayOnMount.current) {
      todayRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      scrollToTodayOnMount.current = false;
    }
  }, [mode, dailyCells]);

  function handleToday() {
    if (mode !== "weekly") {
      scrollToTodayOnMount.current = true;
      setMode("weekly");
    } else {
      todayRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <p className="proof-kicker">Daily score</p>
        <button onClick={handleToday} className="proof-pill proof-focus h-10 border-proof-green/25 px-4 text-sm font-semibold text-proof-green transition active:scale-[0.96]">
          Today ↓
        </button>
      </div>

      {mode === "weekly" ? (
        <div ref={scrollRef} className="overflow-x-auto pb-2">
          <div style={{ minWidth: 32 + columns * 23 }}>
            <div className="relative mb-3 h-4 pl-8 text-xs font-medium text-white/45">
              {MONTH_NAMES.map((name, month) =>
                monthColumnStart[month] ? (
                  <span key={name} className="absolute" style={{ left: 32 + (monthColumnStart[month]! - 1) * 23 }}>
                    {name}
                  </span>
                ) : null
              )}
            </div>
            <div className="flex gap-3">
              <div className="grid grid-rows-7 gap-[5px] py-[1px] text-[10px] text-white/35">
                {WEEKDAY_LABELS.map((day, index) => (
                  <span className="grid h-[18px] place-items-center" key={`${day}-${index}`}>
                    {day}
                  </span>
                ))}
              </div>
              <div
                className="grid gap-[5px]"
                style={{ gridTemplateColumns: `repeat(${columns}, 18px)`, gridTemplateRows: "repeat(7,18px)", gridAutoFlow: "column" }}
              >
                {dailyCells.map((cell, index) =>
                  cell ? <DayButton key={cell.dateKey} cell={cell} ref={cell.isToday ? todayRef : undefined} /> : <span key={`pad-${index}`} />
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {monthlyCells.map((cell) => (
            <MonthButton key={`${cell.year}-${cell.month}`} cell={cell} isCurrent={cell.year === realNow.getFullYear() && cell.month === realNow.getMonth()} />
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-1.5 text-[10px] text-white/35">
        <span className="mr-1">Less</span>
        {(["empty", "success-1", "success-2", "success-3", "success-4"] as HeatmapTone[]).map((tone) => (
          <span key={tone} className={`h-3.5 w-3.5 rounded-[4px] border border-white/[0.04] ${TONE_CLASS[tone]}`} />
        ))}
        <span className="ml-1">More</span>
      </div>

      <div className="mx-auto mt-8 flex w-full max-w-[380px] rounded-full border border-white/[0.09] bg-white/[0.025] p-1">
        {(["monthly", "weekly"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setMode(item)}
            className={`proof-focus flex-1 rounded-full py-3 text-sm font-bold capitalize transition active:scale-[0.97] ${
              mode === item ? "border border-proof-green/35 bg-proof-green/[0.08] text-white shadow-[0_0_28px_rgba(37,216,111,.10)]" : "text-white/32 hover:text-white/60"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}

function DayButton({ cell, ref }: { cell: DayCell; ref?: React.Ref<HTMLButtonElement> }) {
  const label = cell.isFuture ? `${cell.dateKey}: upcoming` : `${cell.dateKey}: ${cell.tone.replace("success-", "level ")}`;
  return (
    <button
      ref={ref}
      title={label}
      aria-label={label}
      className={`proof-focus rounded-[5px] border transition hover:scale-110 ${TONE_CLASS[cell.tone]} ${
        cell.isToday ? "border-white/60 ring-1 ring-white/40" : "border-white/[0.045]"
      }`}
    />
  );
}

function MonthButton({ cell, isCurrent }: { cell: MonthCell; isCurrent: boolean }) {
  return (
    <div
      title={cell.isFuture ? "Upcoming" : `${cell.completion}% completion`}
      className={`proof-focus flex h-24 flex-col items-center justify-center gap-1 rounded-2xl border transition hover:scale-[1.02] ${TONE_CLASS[cell.tone]} ${
        isCurrent ? "border-white/60 ring-1 ring-white/40" : "border-white/[0.06]"
      }`}
    >
      <span className="text-sm font-bold text-white/90">{MONTH_NAMES[cell.month]}</span>
      {!cell.isFuture && <span className="text-[11px] text-white/70">{cell.completion}%</span>}
    </div>
  );
}
