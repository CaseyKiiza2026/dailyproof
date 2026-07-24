import { useMemo } from "react";
import { Habit } from "@/lib/types";
import { classifyDate, completionRatio, computeCompletion } from "@/lib/stats";
import { dateKeyRange, formatDateKey, monthDateKeys } from "@/lib/dates";

export type HeatmapTone = "empty" | "success-1" | "success-2" | "success-3" | "success-4" | "fail" | "rest" | "vacation";

export interface DayCell {
  dateKey: string;
  weekday: number; // 0 = Monday .. 6 = Sunday
  isFuture: boolean;
  isToday: boolean;
  tone: HeatmapTone;
}

function successTone(ratio: number): HeatmapTone {
  if (ratio >= 1) return "success-4";
  if (ratio >= 0.8) return "success-3";
  if (ratio >= 0.65) return "success-2";
  return "success-1";
}

function dayTone(habits: Habit[], dateKey: string, isFuture: boolean): HeatmapTone {
  if (isFuture) return "empty";
  const type = classifyDate(habits, dateKey);
  if (type === "success") return successTone(completionRatio(habits, dateKey));
  if (type === "fail") return "fail";
  if (type === "rest") return "rest";
  if (type === "vacation") return "vacation";
  return "empty";
}

// Daily, GitHub-style: every day of `year` in Monday-first weekday rows, columns
// flowing left to right. Leading/trailing padding cells (weekday !== 0/6 at the
// edges) are `null` so the calendar aligns to real weekdays.
export function useDailyYearCells(habits: Habit[], year: number, realToday: Date) {
  return useMemo(() => {
    const jan1 = new Date(year, 0, 1);
    const dec31 = new Date(year, 11, 31);
    const leadingPad = (jan1.getDay() + 6) % 7; // Mon=0..Sun=6

    const cells: (DayCell | null)[] = Array.from({ length: leadingPad }, () => null);

    for (const dateKey of dateKeyRange(jan1, dec31)) {
      const date = new Date(dateKey);
      const isFuture = date.getTime() > realToday.getTime();
      const isToday = dateKey === formatDateKey(realToday);
      cells.push({
        dateKey,
        weekday: (date.getDay() + 6) % 7,
        isFuture,
        isToday,
        tone: dayTone(habits, dateKey, isFuture)
      });
    }

    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [habits, year, realToday]);
}

export interface MonthCell {
  year: number;
  month: number;
  tone: HeatmapTone;
  completion: number;
  isFuture: boolean;
}

// Coarser overview: one cell per month, colored by that month's completion % —
// the whole month's complete/missed ratio bucketed into the same green palette
// used for a single successful day (rest/vacation/missed all blend together at
// this zoom level, since a month isn't itself a single "success"/"fail" event).
export function useMonthlyYearCells(habits: Habit[], year: number, realToday: Date): MonthCell[] {
  return useMemo(() => {
    const realYear = realToday.getFullYear();
    const realMonth = realToday.getMonth();

    return Array.from({ length: 12 }, (_, month) => {
      const isFuture = year > realYear || (year === realYear && month > realMonth);
      if (isFuture) return { year, month, tone: "empty" as HeatmapTone, completion: 0, isFuture: true };

      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const throughDay = year === realYear && month === realMonth ? realToday.getDate() : daysInMonth;
      const keys = monthDateKeys(year, month, throughDay);
      const completion = computeCompletion(habits, keys);
      const tone: HeatmapTone = completion === 0 ? "empty" : successTone(completion / 100);
      return { year, month, tone, completion, isFuture: false };
    });
  }, [habits, year, realToday]);
}
