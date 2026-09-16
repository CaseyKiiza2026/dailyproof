"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAuthorizationError, requireRead } from "@/lib/read-errors";
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
  const [error, setError] = useState<string | null>(null);
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());
  const [seeding, setSeeding] = useState(false);
  const changedIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const supabase = createClient();

      const {
        data: { user }, error: authError
      } = await supabase.auth.getUser();

      if (authError && authError.name !== "AuthSessionMissingError") throw authError;
      if (!user) {
        if (!cancelled) {
          setHabits([]);
          setLoading(false);
        }
        return;
      }

      const { data: habitRows, error: habitsError } = await supabase
        .from("habits")
        .select("id, name, category, order_index, is_core, scheduled_days")
        .eq("user_id", user.id)
        .order("order_index", { ascending: true });

      requireRead(habitRows, habitsError);
      const habitIds = (habitRows ?? []).map((h) => h.id);

      const { data: logRows, error: logsError } =
        habitIds.length > 0
          ? await supabase.from("habit_logs").select("habit_id, log_date, status").in("habit_id", habitIds)
          : { data: [], error: null };

      requireRead(logRows, logsError);
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
          orderIndex: row.order_index,
          scheduledDays: row.scheduled_days ?? [1, 2, 3, 4, 5, 6, 7]
        };
      });

      if (!cancelled) {
        // Initial reads may overlap creation from an already-open form. Keep
        // changes made locally since this read began, including deletions.
        setHabits(current => [...merged.filter(h => !changedIds.current.has(h.id)), ...current.filter(h => changedIds.current.has(h.id))]);
        setLoading(false);
        setError(null);
      }
    }

    void load().catch(cause => {
      if (cancelled) return;
      if (isAuthorizationError(cause)) { setHabits([]);   }
      setError("Unable to load habits. Please try again.");
      setLoading(false);
    });
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
      changedIds.current.add(habitId);
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
    changedIds.current.add(id);
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
        orderIndex,
        scheduledDays: input.scheduledDays
      }
    ]);
  }

  function handleHabitUpdated(id: string, input: HabitInput) {
    changedIds.current.add(id);
    setHabits((current) =>
      current.map((h) =>
        h.id === id
          ? {
              ...h,
              name: input.name,
              category: input.category,
              subtitle: input.category,
              icon: habitIcon(input.name),
              isCore: input.isCore,
              scheduledDays: input.scheduledDays
            }
          : h
      )
    );
  }

  function handleHabitDeleted(id: string) {
    changedIds.current.add(id);
    setHabits((current) => current.filter((h) => h.id !== id));
  }

  async function handleSeedStarterHabits() {
    setSeeding(true);
    const result = await seedStarterHabits();
    setSeeding(false);
    if (!result.success) return;
    for (const row of result.data) changedIds.current.add(row.id);

    setHabits(
      result.data.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        subtitle: row.category,
        icon: habitIcon(row.name),
        logsByDate: {},
        isCore: true,
        orderIndex: row.order_index,
        scheduledDays: [1, 2, 3, 4, 5, 6, 7]
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
    error,
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
