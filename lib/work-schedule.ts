import { CalendarData, freeSlots } from "@/lib/calendar";
import {
  dateKeyInTimeZone,
  shiftDateKey,
  localDateTimeToUtc,
} from "@/lib/timezone";
import { WorkAction, validateWorkAction } from "@/lib/work-actions";
import { Task } from "@/lib/tasks";

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
    validateWorkAction(action, true);
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
    tasks: [
      ...calendar.tasks.filter((t) => !ids.has(t.id)),
      ...taskActions.map((a) => ({
        ...a.values,
        id: a.id,
      })),
    ],
  };
  for (const action of taskActions) {
    const task = action.values;
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
