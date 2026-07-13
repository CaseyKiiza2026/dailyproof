"use server";

import { createClient } from "@/lib/supabase/server";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

export interface HabitInput {
  name: string;
  category: string;
  isCore: boolean;
}

export async function createHabit(input: HabitInput): Promise<ActionResult<{ id: string; orderIndex: number }>> {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated." };

  const name = input.name.trim();
  if (!name) return { success: false, error: "Habit name is required." };

  const { data: maxRow } = await supabase
    .from("habits")
    .select("order_index")
    .eq("user_id", user.id)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrderIndex = (maxRow?.order_index ?? -1) + 1;

  const { data, error } = await supabase
    .from("habits")
    .insert({
      user_id: user.id,
      name,
      category: input.category,
      is_core: input.isCore,
      order_index: nextOrderIndex
    })
    .select("id, order_index")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Failed to create habit." };
  return { success: true, data: { id: data.id, orderIndex: data.order_index } };
}

export async function updateHabit(habitId: string, input: HabitInput): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated." };

  const name = input.name.trim();
  if (!name) return { success: false, error: "Habit name is required." };

  const { error } = await supabase
    .from("habits")
    .update({ name, category: input.category, is_core: input.isCore })
    .eq("id", habitId)
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

export async function deleteHabit(habitId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated." };

  const { error } = await supabase.from("habits").delete().eq("id", habitId).eq("user_id", user.id);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

const STARTER_HABITS: { name: string; category: string }[] = [
  { name: "45 min ML minimum", category: "ML / Career" },
  { name: "Code something", category: "ML / Career" },
  { name: "Protein target", category: "Fitness / Bulk" },
  { name: "Calories target", category: "Fitness / Bulk" },
  { name: "Gym or recovery", category: "Fitness / Bulk" },
  { name: "Water", category: "Sleep / Recovery" },
  { name: "No social before 5 PM", category: "Discipline" },
  { name: "Plan tomorrow", category: "Discipline" }
];

export interface SeedHabitRow {
  id: string;
  name: string;
  category: string;
  order_index: number;
}

export async function seedStarterHabits(): Promise<ActionResult<SeedHabitRow[]>> {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated." };

  const { count } = await supabase.from("habits").select("id", { count: "exact", head: true }).eq("user_id", user.id);

  if (count && count > 0) return { success: false, error: "Starter habits can only be added when you have no habits yet." };

  const rows = STARTER_HABITS.map((habit, index) => ({
    user_id: user.id,
    name: habit.name,
    category: habit.category,
    is_core: true,
    order_index: index
  }));

  const { data, error } = await supabase.from("habits").insert(rows).select("id, name, category, order_index");

  if (error || !data) return { success: false, error: error?.message ?? "Failed to add starter habits." };
  return { success: true, data };
}
