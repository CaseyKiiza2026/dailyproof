import { CalendarData, freeSlots } from "@/lib/calendar";
import {
  dateKeyInTimeZone,
  shiftDateKey,
  localDateTimeToUtc,
} from "@/lib/timezone";
import { WorkAction, validateWorkAction } from "@/lib/work-actions";
import { Task } from "@/lib/tasks";
import type { AppOperation } from "@/lib/app-operations";

type ScheduleCalendar = Omit<CalendarData, "tasks"> & {
  tasks: Pick<Task, "id" | "status" | "scheduled_start" | "scheduled_end">[];
};

export function calendarFreeSlots(
  calendar: ScheduleCalendar,
  timeZone: string,
  start: string,
  end: string,
  minutes: number,
  excludeTaskId?: string,
) {
  const blocks = [
    ...calendar.commitments.map((c) => ({
      start: c.start_at,
      end: c.end_at,
    })),
    ...calendar.tasks
      .filter(
        (t) =>
          t.scheduled_start &&
          t.status !== "cancelled" &&
          t.id !== excludeTaskId,
      )
      .map((t) => ({ start: t.scheduled_start!, end: t.scheduled_end! })),
  ];
  // Validate range before expanding recurring habits.
  freeSlots(start, end, minutes, []);
  const first = dateKeyInTimeZone(new Date(start), timeZone),
    last = dateKeyInTimeZone(new Date(end), timeZone);
  for (
    let day = shiftDateKey(first, -1);
    day <= last;
    day = shiftDateKey(day, 1)
  )
    for (const h of calendar.habits) {
      if (
        !h.scheduled_time ||
        !h.scheduled_days.includes(new Date(`${day}T12:00Z`).getUTCDay() || 7)
      )
        continue;
      try {
        const at = localDateTimeToUtc(
          `${day}T${h.scheduled_time.slice(0, 5)}`,
          timeZone,
        )!;
        blocks.push({
          start: at,
          end: new Date(
            Date.parse(at) + h.duration_minutes! * 60000,
          ).toISOString(),
        });
      } catch {
        throw new Error(
          "A recurring habit falls in a daylight-saving transition. Review that day manually.",
        );
      }
    }
  return freeSlots(start, end, minutes, blocks);
}

// Replace every moved task before checking any proposed interval. Database
// application repeats authoritative checks under the owner's scheduling lock.
export function validateProposedSchedule(
  calendar: CalendarData,
  actions: WorkAction[],
  timeZone: string,
) {
  const taskActions = actions.filter(
    (a): a is Extract<WorkAction, { tool: "create_task" | "update_task" }> =>
      a.tool === "create_task" || a.tool === "update_task",
  );
  const ids = new Set<string>();
  for (const action of taskActions) {
    const original = calendar.tasks.find((t) => t.id === action.id);
    const scheduling =
      action.tool === "create_task" ||
      !original ||
      original.scheduled_start !== action.values.scheduled_start ||
      original.scheduled_end !== action.values.scheduled_end ||
      (original.status === "cancelled" && action.values.status !== "cancelled");
    // Completing or editing existing work is not a new scheduling request.
    validateWorkAction(action, scheduling);
    if (ids.has(action.id))
      throw new Error("Propose only one final change per task.");
    ids.add(action.id);
    if (
      action.tool === "update_task" &&
      !calendar.tasks.some((t) => t.id === action.id)
    )
      throw new Error("Proposed task was not found.");
    if (
      action.tool === "create_task" &&
      calendar.tasks.some((t) => t.id === action.id)
    )
      throw new Error("Proposed task already exists.");
  }
  const finalCalendar: ScheduleCalendar = {
    ...calendar,
    commitments: [
      ...calendar.commitments.filter(
        (c) =>
          !actions.some(
            (a) =>
              (a.tool === "update_commitment" ||
                a.tool === "delete_commitment") &&
              a.id === c.id,
          ),
      ),
      ...actions
        .filter(
          (
            a,
          ): a is Extract<
            WorkAction,
            { tool: "create_commitment" | "update_commitment" }
          > => a.tool === "create_commitment" || a.tool === "update_commitment",
        )
        .map((a) => ({ ...a.values, id: a.id, user_id: "" })),
    ],
    tasks: [
      ...calendar.tasks.filter(
        (t) =>
          !ids.has(t.id) &&
          !actions.some((a) => a.tool === "delete_task" && a.id === t.id),
      ),
      ...taskActions.map((a) => ({
        ...a.values,
        id: a.id,
      })),
    ],
    habits: [
      ...calendar.habits
        .filter(
          (h) =>
            !actions.some(
              (a) =>
                a.tool === "delete_all_habits" ||
                (a.tool === "delete_habit" && a.id === h.id),
            ),
        )
        .map((h) => {
          const change = actions.find(
            (a) =>
              (a.tool === "update_habit" || a.tool === "set_habit_time") &&
              a.id === h.id,
          );
          return change ? { ...h, ...change.values } : h;
        }),
      ...actions
        .filter((a): a is AppOperation => a.tool === "create_habit")
        .map((a) => ({
          id: a.id,
          name: a.values.name as string,
          scheduled_days: a.values.scheduled_days as number[],
          scheduled_time: a.values.scheduled_time as string | null,
          duration_minutes: a.values.duration_minutes as number | null,
        })),
    ],
  };
  for (const action of taskActions) {
    const task = action.values;
    const original = calendar.tasks.find((t) => t.id === action.id);
    if (
      original &&
      original.scheduled_start === task.scheduled_start &&
      original.scheduled_end === task.scheduled_end &&
      !(original.status === "cancelled" && task.status !== "cancelled")
    )
      continue;
    if (
      !task.scheduled_start ||
      !task.scheduled_end ||
      task.status === "cancelled"
    )
      continue;
    const minutes =
      (Date.parse(task.scheduled_end) - Date.parse(task.scheduled_start)) /
      60000;
    if (
      !calendarFreeSlots(
        finalCalendar,
        timeZone,
        task.scheduled_start,
        task.scheduled_end,
        minutes,
        action.id,
      ).length
    )
      throw new Error(
        "The proposed time overlaps existing work. Ask for another plan.",
      );
  }
}
