"use server";

import { createClient } from "@/lib/supabase/server";
import { HabitStatus } from "@/lib/types";
import { calendarDays } from "@/lib/timezone";

type UpsertResult = { success: true } | { success: false; error: string };

export async function upsertHabitLog(habitId: string, logDate: string, status: HabitStatus): Promise<UpsertResult> {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    console.error("upsertHabitLog: not authenticated");
    return { success: false, error: "Not authenticated." };
  }

  const { data: habit } = await supabase.from("habits").select("id").eq("id", habitId).eq("user_id", user.id).maybeSingle();

  if (!habit) {
    console.error(`upsertHabitLog: habit ${habitId} not found for user ${user.id}`);
    return { success: false, error: "Habit not found." };
  }

  const { data: preferences, error: preferencesError } = await supabase.from("user_preferences")
    .select("timezone").eq("user_id", user.id).single();
  if (preferencesError || !preferences) return { success: false, error: "Please finish timezone setup before logging." };
  const { today, yesterday } = calendarDays(new Date(), preferences.timezone);

  if (logDate !== today && logDate !== yesterday) {
    console.error(`upsertHabitLog: ${logDate} is outside the edit window (today=${today}, yesterday=${yesterday})`);
    return { success: false, error: "This day is outside the edit window." };
  }

  const loggedLate = logDate === yesterday;

  if (status === "empty") {
    const { error } = await supabase
      .from("habit_logs")
      .delete()
      .eq("habit_id", habitId)
      .eq("user_id", user.id)
      .eq("log_date", logDate);

    if (error) {
      console.error("upsertHabitLog: delete failed:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  const { error } = await supabase.from("habit_logs").upsert(
    {
      habit_id: habitId,
      user_id: user.id,
      log_date: logDate,
      status,
      logged_late: loggedLate,
      updated_at: new Date().toISOString()
    },
    { onConflict: "habit_id,log_date" }
  );

  if (error) {
    console.error("upsertHabitLog: upsert failed:", error);
    return { success: false, error: error.message };
  }
  return { success: true };
}
