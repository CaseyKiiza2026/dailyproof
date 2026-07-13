"use server";

import { createClient } from "@/lib/supabase/server";
import { HabitStatus } from "@/lib/types";

type UpsertResult = { success: true } | { success: false; error: string };

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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

  // Server-side clock, not the caller's — a spoofed client clock must not be
  // able to widen the edit window.
  const now = new Date();
  const today = formatDateKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = formatDateKey(yesterdayDate);

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
