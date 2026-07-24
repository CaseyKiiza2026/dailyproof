import { useMemo } from "react";
import { Habit } from "@/lib/types";
import { computeHabitStats, HabitStats } from "@/lib/stats";

// Single source of truth for the stat-card numbers on both the Dashboard and the
// Year page — every caller must go through this hook so the two pages can never
// drift apart for the same underlying data.
export function useHabitStats(habits: Habit[], monthlyDateKeys: string[], streakDateKeys: string[]): HabitStats {
  return useMemo(
    () => computeHabitStats(habits, monthlyDateKeys, streakDateKeys),
    [habits, monthlyDateKeys, streakDateKeys]
  );
}
