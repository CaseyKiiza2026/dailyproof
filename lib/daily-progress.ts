import { Habit, HabitStatus } from "@/lib/types";
import { Task } from "@/lib/tasks";
import { dateKeyInTimeZone } from "@/lib/timezone";

export type ProgressHabit = Pick<Habit, "scheduledDays" | "logsByDate">;

export function habitStatusOnDay(
  habit: ProgressHabit,
  day: string,
): HabitStatus | "unscheduled" {
  const weekday = new Date(`${day}T12:00Z`).getUTCDay() || 7;
  return habit.scheduledDays.includes(weekday)
    ? (habit.logsByDate[day] ?? "empty")
    : "unscheduled";
}

export function isTaskOnDay(task: Task, day: string, timeZone: string) {
  return (
    task.status !== "cancelled" &&
    [task.due_at, task.scheduled_start].some(
      (value) => value && dateKeyInTimeZone(new Date(value), timeZone) === day,
    )
  );
}

function activityStatuses(
  habits: ProgressHabit[],
  tasks: Task[],
  day: string,
  timeZone: string,
): HabitStatus[] {
  const statuses = habits
    .map((h) => habitStatusOnDay(h, day))
    .filter((s): s is HabitStatus => s !== "unscheduled");
  for (const task of tasks.filter((t) => isTaskOnDay(t, day, timeZone)))
    statuses.push(task.status === "completed" ? "complete" : "empty");
  return statuses;
}

function summarizeActivities(statuses: HabitStatus[]) {
  const total = statuses.length;
  const rest = statuses.filter((s) => s === "rest").length;
  const vacation = statuses.filter((s) => s === "vacation").length;
  const eligible = total - rest - vacation;
  const completed = statuses.filter((s) => s === "complete").length;
  const missed = statuses.filter((s) => s === "missed").length;
  return {
    total,
    eligible,
    completed,
    missed,
    rest,
    vacation,
    incomplete: eligible - completed,
    completion: eligible ? Math.round((completed / eligible) * 100) : 0,
  };
}

export function dailyProgress(
  habits: ProgressHabit[],
  tasks: Task[],
  day: string,
  timeZone: string,
) {
  return summarizeActivities(activityStatuses(habits, tasks, day, timeZone));
}

// Count eligible activity-days, not an average of rounded daily percentages.
// A task due and scheduled on the same day counts once, as on Dashboard.
export function periodProgress(
  habits: ProgressHabit[],
  tasks: Task[],
  days: string[],
  timeZone: string,
) {
  return summarizeActivities(
    days.flatMap((day) => activityStatuses(habits, tasks, day, timeZone)),
  );
}
