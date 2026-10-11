"use server";

import { requireUser } from "@/lib/server-user";
import { executeWorkActions } from "@/lib/work-service";
type ActionResult<T = undefined> =
  { success: true; data: T } | { success: false; error: string };
export interface HabitInput {
  name: string;
  category: string;
  isCore: boolean;
  scheduledDays: number[];
}
async function saveHabitRecord(id: string | null, input: HabitInput) {
  const { db, user } = await requireUser();
  const target = id ?? crypto.randomUUID();
  let timing = {
    scheduled_time: null as string | null,
    duration_minutes: null as number | null,
  };
  if (id) {
    const { data, error } = await db
      .from("habits")
      .select("scheduled_time,duration_minutes")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (error || !data) throw new Error("Habit unavailable.");
    timing = {
      scheduled_time: data.scheduled_time?.slice(0, 5) ?? null,
      duration_minutes: data.duration_minutes,
    };
  }
  const days = [
    ...new Set(
      input.scheduledDays.filter(
        (d) => Number.isInteger(d) && d >= 1 && d <= 7,
      ),
    ),
  ];
  await executeWorkActions([
    {
      tool: id ? "update_habit" : "create_habit",
      id: target,
      values: {
        name: input.name,
        category: input.category,
        is_core: input.isCore,
        scheduled_days: days.length ? days : [1, 2, 3, 4, 5, 6, 7],
        ...timing,
      },
    },
  ]);
  const { data, error } = await db
    .from("habits")
    .select("id,order_index")
    .eq("id", target)
    .eq("user_id", user.id)
    .single();
  if (error || !data) throw new Error("Unable to confirm saved habit.");
  return { id: data.id as string, orderIndex: data.order_index as number };
}
export async function createHabit(
  input: HabitInput,
): Promise<ActionResult<{ id: string; orderIndex: number }>> {
  try {
    return { success: true, data: await saveHabitRecord(null, input) };
  } catch {
    return {
      success: false,
      error: "Unable to create habit. Check the details and schedule.",
    };
  }
}
export async function updateHabit(
  habitId: string,
  input: HabitInput,
): Promise<ActionResult> {
  try {
    await saveHabitRecord(habitId, input);
    return { success: true, data: undefined };
  } catch {
    return {
      success: false,
      error: "Unable to update habit. Check ownership and schedule.",
    };
  }
}
export async function deleteHabit(habitId: string): Promise<ActionResult> {
  try {
    await executeWorkActions([
      { tool: "delete_habit", id: habitId, values: {} },
    ]);
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Unable to delete habit." };
  }
}
export interface SeedHabitRow {
  id: string;
  name: string;
  category: string;
  order_index: number;
}
export async function seedStarterHabits(): Promise<
  ActionResult<SeedHabitRow[]>
> {
  try {
    const { db, user } = await requireUser();
    await executeWorkActions([
      { tool: "seed_starter_habits", id: crypto.randomUUID(), values: {} },
    ]);
    const { data, error } = await db
      .from("habits")
      .select("id,name,category,order_index")
      .eq("user_id", user.id)
      .order("order_index");
    if (error || !data) throw new Error("Unable to confirm starter habits.");
    return { success: true, data };
  } catch {
    return {
      success: false,
      error: "Starter habits can only be added to an empty habit list.",
    };
  }
}
