import { Task } from "@/lib/tasks";
export interface Commitment {
  id: string;
  user_id: string;
  title: string;
  description: string;
  start_at: string;
  end_at: string;
}
export type CommitmentInput = Pick<
  Commitment,
  "title" | "description" | "start_at" | "end_at"
>;
export function validateCommitment(input: CommitmentInput): CommitmentInput {
  if (!input) throw new Error("Invalid commitment.");
  validateBlock(input.title, input.start_at, input.end_at);
  if (typeof input.description !== "string" || input.description.length > 10000)
    throw new Error("Description is too long.");
  return {
    title: input.title.trim(),
    description: input.description,
    start_at: input.start_at,
    end_at: input.end_at,
  };
}
export interface TimedHabit {
  id: string;
  name: string;
  scheduled_days: number[];
  scheduled_time: string | null;
  duration_minutes: number | null;
}
export interface CalendarData {
  tasks: Task[];
  commitments: Commitment[];
  habits: TimedHabit[];
}
export function validateBlock(title: string, start: string, end: string) {
  if (typeof title !== "string" || !title.trim() || title.trim().length > 200)
    throw new Error("Enter a title of 1–200 characters.");
  if (
    ![start, end].every(
      (v) =>
        typeof v === "string" &&
        /(Z|[+-]\d{2}:\d{2})$/.test(v) &&
        Number.isFinite(Date.parse(v)),
    ) ||
    Date.parse(end) <= Date.parse(start)
  )
    throw new Error("End must be after start, with explicit UTC offsets.");
}
export function freeSlots(
  start: string,
  end: string,
  duration: number,
  blocks: { start: string; end: string }[],
) {
  if (!Number.isInteger(duration) || duration < 5 || duration > 720)
    throw new Error("Duration must be 5–720 minutes.");
  validateBlock("Time range", start, end);
  if (Date.parse(end) - Date.parse(start) > 31 * 86400000)
    throw new Error("Search at most 31 days at a time.");
  const sorted = blocks
    .map((b) => ({
      start: Math.max(Date.parse(start), Date.parse(b.start)),
      end: Math.min(Date.parse(end), Date.parse(b.end)),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const slots: { start: string; end: string }[] = [];
  let cursor = Date.parse(start);
  for (const block of [
    ...sorted,
    { start: Date.parse(end), end: Date.parse(end) },
  ]) {
    if (block.start - cursor >= duration * 60000)
      slots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(block.start).toISOString(),
      });
    cursor = Math.max(cursor, block.end);
  }
  return slots;
}
