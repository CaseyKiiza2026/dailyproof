import { dateKeyInTimeZone, shiftDateKey } from "@/lib/timezone";

export interface Task {
  id: string; user_id: string; title: string; description: string;
  due_at: string | null; scheduled_start: string | null; scheduled_end: string | null;
  status: "pending" | "completed" | "cancelled";
  priority: "low" | "normal" | "high"; created_at: string; updated_at: string;
}
export type TaskInput = Pick<Task, "title" | "description" | "due_at" | "scheduled_start" | "scheduled_end" | "priority" | "status">;
export const taskBuckets = ["Overdue", "Due today", "Due tomorrow", "Due this week", "Due later", "Due someday", "Completed", "Cancelled"] as const;
export function taskBucket(task: Task, today: string, timeZone: string): typeof taskBuckets[number] {
  if (task.status === "completed") return "Completed";
  if (task.status === "cancelled") return "Cancelled";
  if (!task.due_at) return "Due someday";
  const due = dateKeyInTimeZone(new Date(task.due_at), timeZone);
  if (due < today) return "Overdue";
  if (due === today) return "Due today";
  if (due === shiftDateKey(today, 1)) return "Due tomorrow";
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
  return due <= shiftDateKey(today, 7 - weekday) ? "Due this week" : "Due later";
}
export function validateTask(input: TaskInput): TaskInput {
  if (!input || typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 200) throw new Error("Enter a title of 1–200 characters.");
  if (typeof input.description !== "string" || input.description.length > 10000) throw new Error("Description must be at most 10,000 characters.");
  if (!["pending", "completed", "cancelled"].includes(input.status) || !["low", "normal", "high"].includes(input.priority)) throw new Error("Invalid status or priority.");
  for (const value of [input.due_at, input.scheduled_start, input.scheduled_end]) {
    if (value !== null && (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))) throw new Error("Dates must include a UTC offset.");
  }
  if (Boolean(input.scheduled_start) !== Boolean(input.scheduled_end) || (input.scheduled_start && input.scheduled_end && Date.parse(input.scheduled_end) <= Date.parse(input.scheduled_start))) throw new Error("Schedule end must be after its start.");
  return { title: input.title.trim(), description: input.description.trim(), due_at: input.due_at, scheduled_start: input.scheduled_start, scheduled_end: input.scheduled_end, priority: input.priority, status: input.status };
}
