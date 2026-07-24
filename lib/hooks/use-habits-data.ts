"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { upsertHabitLog } from "@/lib/actions/habit-logs";
import { HabitInput, seedStarterHabits } from "@/lib/actions/habits";
import { Habit, HabitStatus } from "@/lib/types";

function habitIcon(name: string) {
  return name.slice(0, 2).toUpperCase();
}

// Fetches every habit and its FULL log history (not scoped to any month) — the
// single data source shared by the Dashboard and the Year page, so a streak or
// completion figure computed from it can never mean something different on one
// page than the other.
export function useHabitsData() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const supabase = createClient();

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setHabits([]);
          setLoading(false);
        }
        return;
      }

      const { data: habitRows } = await supabase
        .from("habits")
        .select("id, name, category, order_index, is_core")
        .eq("user_id", user.id)
        .order("order_index", { ascending: true });

      const habitIds = (habitRows ?? []).map((h) => h.id);

      const { data: logRows } =
        habitIds.length > 0
          ? await supabase.from("habit_logs").select("habit_id, log_date, status").in("habit_id", habitIds)
          : { data: [] };

      const merged: Habit[] = (habitRows ?? []).map((row) => {
        const logsByDate: Record<string, HabitStatus> = {};
        for (const log of logRows ?? []) {
          if (log.habit_id !== row.id) continue;
          logsByDate[log.log_date] = log.status as HabitStatus;
        }
        return {
          id: row.id,
          name: row.name,
          category: row.category,
          subtitle: row.category,
          icon: habitIcon(row.name),
          logsByDate,
          isCore: row.is_core,
          orderIndex: row.order_index
        };
      });

      if (!cancelled) {
        setHabits(merged);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateCell = useCallback(
    async (habitId: string, dateKey: string, nextStatus: HabitStatus) => {
      const key = `${habitId}:${dateKey}`;
      if (pendingCells.has(key)) return;

      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;
      const previousStatus = habit.logsByDate[dateKey] ?? "empty";

      setPendingCells((current) => new Set(current).add(key));
      setHabits((current) =>
        current.map((h) => {
          if (h.id !== habitId) return h;
          const logsByDate = { ...h.logsByDate };
          if (nextStatus === "empty") delete logsByDate[dateKey];
          else logsByDate[dateKey] = nextStatus;
          return { ...h, logsByDate };
        })
      );

      const result = await upsertHabitLog(habitId, dateKey, nextStatus);

      if (!result.success) {
        console.error(`Failed to save habit log (habit ${habitId}, ${dateKey}, status ${nextStatus}):`, result.error);
        setHabits((current) =>
          current.map((h) => {
            if (h.id !== habitId) return h;
            const logsByDate = { ...h.logsByDate };
            if (previousStatus === "empty") delete logsByDate[dateKey];
            else logsByDate[dateKey] = previousStatus;
            return { ...h, logsByDate };
          })
        );
      }

      setPendingCells((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    },
    [habits, pendingCells]
  );

  function handleHabitCreated(id: string, orderIndex: number, input: HabitInput) {
    setHabits((current) => [
      ...current,
      {
        id,
        name: input.name,
        category: input.category,
        subtitle: input.category,
        icon: habitIcon(input.name),
        logsByDate: {},
        isCore: input.isCore,
        orderIndex
      }
    ]);
  }

  function handleHabitUpdated(id: string, input: HabitInput) {
    setHabits((current) =>
      current.map((h) =>
        h.id === id
          ? { ...h, name: input.name, category: input.category, subtitle: input.category, icon: habitIcon(input.name), isCore: input.isCore }
          : h
      )
    );
  }

  function handleHabitDeleted(id: string) {
    setHabits((current) => current.filter((h) => h.id !== id));
  }

  async function handleSeedStarterHabits() {
    setSeeding(true);
    const result = await seedStarterHabits();
    setSeeding(false);
    if (!result.success) return;

    setHabits(
      result.data.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        subtitle: row.category,
        icon: habitIcon(row.name),
        logsByDate: {},
        isCore: true,
        orderIndex: row.order_index
      }))
    );
  }

  // Earliest logged date across every habit, or null if nothing has ever been
  // logged — the natural start of the "full history" range used for streaks.
  const earliestLogDate = habits.reduce<string | null>((earliest, habit) => {
    for (const dateKey of Object.keys(habit.logsByDate)) {
      if (!earliest || dateKey < earliest) earliest = dateKey;
    }
    return earliest;
  }, null);

  return {
    habits,
    loading,
    pendingCells,
    seeding,
    earliestLogDate,
    updateCell,
    handleHabitCreated,
    handleHabitUpdated,
    handleHabitDeleted,
    handleSeedStarterHabits
  };
}
