"use client";

import { useCallback, useMemo, useState } from "react";
import { dateKeyRange, formatDateKey, monthDateKeys } from "@/lib/dates";
import { HabitStatus } from "@/lib/types";
import { useHabitsData } from "@/lib/hooks/use-habits-data";

const CYCLE: HabitStatus[] = ["empty", "complete", "missed", "rest", "vacation"];

export function useDashboardHabits() {
  const data = useHabitsData();

  const realNow = useMemo(() => new Date(), []);
  const realYear = realNow.getFullYear();
  const realMonth = realNow.getMonth();
  const realDay = realNow.getDate();
  const realToday = formatDateKey(realNow);

  const [viewYear, setViewYear] = useState(realYear);
  const [viewMonth, setViewMonth] = useState(realMonth);
  const [selectedDay, setSelectedDay] = useState(realDay);

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

  async function updateCell(habitId: string, day: number) {
    if (!isEditableDate(day)) return;
    const habit = data.habits.find((h) => h.id === habitId);
    if (!habit) return;

    const dateKey = formatDateKey(new Date(viewYear, viewMonth, day));
    const previousStatus = habit.logsByDate[dateKey] ?? "empty";
    const nextStatus = CYCLE[(CYCLE.indexOf(previousStatus) + 1) % CYCLE.length];
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
    jumpToMonth,
    goToToday,
    jumpToDate,
    updateCell
  };
}
