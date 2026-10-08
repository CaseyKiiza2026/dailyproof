"use server";
import { requireUser } from "@/lib/server-user";
import { getTasks } from "@/lib/actions/tasks";
import { CalendarData, Commitment, validateCommitment } from "@/lib/calendar";
import { executeWorkActions } from "@/lib/work-service";
export async function getCalendar(): Promise<CalendarData> {
  const { db, user } = await requireUser();
  const [tasks, commitments, habits] = await Promise.all([
    getTasks(),
    db.from("commitments").select("*").eq("user_id", user.id).order("start_at"),
    db
      .from("habits")
      .select("id,name,scheduled_days,scheduled_time,duration_minutes")
      .eq("user_id", user.id),
  ]);
  if (commitments.error || habits.error)
    throw new Error("Unable to load calendar.", {
      cause: { code: (commitments.error ?? habits.error)?.code },
    });
  return { tasks, commitments: commitments.data, habits: habits.data };
}
export async function saveCommitment(
  id: string | null,
  input: Pick<Commitment, "title" | "description" | "start_at" | "end_at">,
) {
  const values = validateCommitment(input);
  await executeWorkActions([
    {
      tool: id ? "update_commitment" : "create_commitment",
      id: id ?? crypto.randomUUID(),
      values,
    },
  ]);
}
export async function deleteCommitment(id: string) {
  const { db, user } = await requireUser();
  const { error } = await db
    .from("commitments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .single();
  if (error) throw new Error("Unable to delete commitment.");
}
export async function setHabitTime(
  id: string,
  time: string | null,
  duration: number | null,
) {
  if (
    time !== null &&
    (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
      !Number.isInteger(duration) ||
      duration! < 5 ||
      duration! > 720)
  )
    throw new Error("Enter a time and duration of 5–720 minutes.");
  const { db, user } = await requireUser();
  const { error } = await db
    .from("habits")
    .update({ scheduled_time: time, duration_minutes: time ? duration : null })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .single();
  if (error) throw new Error("Unable to save habit time.");
}
