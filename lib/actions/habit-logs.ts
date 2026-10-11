"use server";
import { HabitStatus } from "@/lib/types";
import { executeWorkActions } from "@/lib/work-service";
type UpsertResult = { success: true } | { success: false; error: string };
export async function upsertHabitLog(
  habitId: string,
  logDate: string,
  status: HabitStatus,
): Promise<UpsertResult> {
  try {
    await executeWorkActions([
      { tool: "log_habit", id: habitId, values: { log_date: logDate, status } },
    ]);
    return { success: true };
  } catch {
    return {
      success: false,
      error:
        "Unable to save this check-in. Only your habits for today or yesterday can be edited.",
    };
  }
}
