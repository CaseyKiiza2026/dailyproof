"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { dateKeyRange, formatDateKey, isoDayOfWeek, monthDateKeys } from "@/lib/dates";
import { HabitStatus } from "@/lib/types";
import { useHabitsData } from "@/lib/hooks/use-habits-data";

// Supports deep-linking from the Year page's month tiles: /dashboard?month=YYYY-MM
// opens straight to that month instead of the real current one.
function parseMonthParam(value: string | null): { year: number; month: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { year, month };
}

export function useDashboardHabits() {
  const data = useHabitsData();
  const searchParams = useSearchParams();

  const realNow = useMemo(() => new Date(), []);
  const realYear = realNow.getFullYear();
  const realMonth = realNow.getMonth();
  const realDay = realNow.getDate();
  const realToday = formatDateKey(realNow);

  const initialMonth = useMemo(() => parseMonthParam(searchParams.get("month")), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [viewYear, setViewYear] = useState(initialMonth?.year ?? realYear);
  const [viewMonth, setViewMonth] = useState(initialMonth?.month ?? realMonth);
  const [selectedDay, setSelectedDay] = useState(initialMonth ? 1 : realDay);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const isCurrentMonth = viewYear === realYear && viewMonth === realMonth;
  const isPastMonth = viewYear < realYear || (viewYear === realYear && viewMonth < realMonth);

  // How many days of the viewed month count toward the monthly stats: all of it
  // if the month is over, none of it if it hasn't started yet, up through today
  // if it's the current one.
  const effectiveToday = isCurrentMonth ? realDay : isPastMonth ? daysInMonth : 0;

  const monthlyDateKeys = useMemo(
    () => monthDateKeys(viewYear, viewMonth, effectiveToday),
    [viewYear, viewMonth, effectiveToday]
  );

  // Current/best streak are a continuous, real-time fact — always computed from
  // the earliest log through REAL today, independent of whichever month is being
  // browsed above (so streak stays constant while browsing history, per design).
  const streakDateKeys = useMemo(() => {
    const start = data.earliestLogDate ? new Date(data.earliestLogDate) : realNow;
    return dateKeyRange(start, realNow);
  }, [data.earliestLogDate, realNow]);

  const isEditableDate = useCallback(
    (day: number) => {
      const cell = new Date(viewYear, viewMonth, day).getTime();
      const today = new Date(realYear, realMonth, realDay).getTime();
      const yesterday = new Date(realYear, realMonth, realDay - 1).getTime();
      return cell === today || cell === yesterday;
    },
    [viewYear, viewMonth, realYear, realMonth, realDay]
  );

  const jumpToMonth = useCallback((year: number, month: number) => {
    setViewYear(year);
    setViewMonth(month);
    setSelectedDay(1);
  }, []);

  const goToToday = useCallback(() => {
    setViewYear(realYear);
    setViewMonth(realMonth);
    setSelectedDay(realDay);
  }, [realYear, realMonth, realDay]);

  const jumpToDate = useCallback((isoDate: string) => {
    const [y, m, d] = isoDate.split("-").map(Number);
    if (!y || !m || !d) return;
    setViewYear(y);
    setViewMonth(m - 1);
    setSelectedDay(d);
  }, []);

  const isScheduledDate = useCallback(
    (habitId: string, day: number) => {
      const habit = data.habits.find((h) => h.id === habitId);
      if (!habit) return false;
      const dow = isoDayOfWeek(formatDateKey(new Date(viewYear, viewMonth, day)));
      return habit.scheduledDays.includes(dow);
    },
    [data.habits, viewYear, viewMonth]
  );

  // Explicit status selection (dropdown), not a click-cycle. Refuses on
  // non-scheduled days too, as a defense-in-depth backstop — the grid never
  // renders a dropdown for those cells in the first place.
  async function updateCell(habitId: string, day: number, nextStatus: HabitStatus) {
    if (!isEditableDate(day)) return;
    if (!isScheduledDate(habitId, day)) return;

    const dateKey = formatDateKey(new Date(viewYear, viewMonth, day));
    await data.updateCell(habitId, dateKey, nextStatus);
  }

  return {
    ...data,
    viewYear,
    viewMonth,
    daysInMonth,
    isCurrentMonth,
    effectiveToday,
    selectedDay,
    setSelectedDay,
    realYear,
    realMonth,
    realDay,
    realToday,
    monthlyDateKeys,
    streakDateKeys,
    isEditableDate,
    isScheduledDate,
    jumpToMonth,
    goToToday,
    jumpToDate,
    updateCell
  };
}
