import { TaskInput, validateTask } from "@/lib/tasks";
import { ReminderInput, validateReminder } from "@/lib/notifications";
import { CommitmentInput, validateCommitment } from "@/lib/calendar";
import {
  AppOperation,
  isAppOperation,
  validateAppOperation,
} from "@/lib/app-operations";
export type WorkAction = (
  | AppOperation
  | { tool: "create_task" | "update_task"; id: string; values: TaskInput }
  | {
      tool: "create_commitment" | "update_commitment";
      id: string;
      values: CommitmentInput;
    }
  | {
      tool: "create_reminder" | "update_reminder";
      id: string;
      values: ReminderInput;
    }
  | { tool: "cancel_reminder"; id: string; values: Record<string, never> }
) & {
  expected_updated_at?: string;
  displayTitle?: string;
  expected_habit_ids?: string[];
};
export function validateWorkAction(action: WorkAction, ai = false) {
  if (
    !action ||
    typeof action.id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(action.id)
  )
    throw new Error("Invalid action identity.");
  if (
    action.tool === "delete_all_habits" &&
    (!Array.isArray(action.expected_habit_ids) ||
      action.expected_habit_ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id)))
  )
    throw new Error("A reviewed habit snapshot is required.");
  if (isAppOperation(action.tool))
    return validateAppOperation(action as AppOperation);
  if (action.tool === "create_task" || action.tool === "update_task") {
    const task = validateTask(action.values);
    if (ai && task.scheduled_start && task.scheduled_end) {
      const duration =
        Date.parse(task.scheduled_end) - Date.parse(task.scheduled_start);
      if (duration < 300000 || duration > 43200000)
        throw new Error("AI schedules must last 5 minutes to 12 hours.");
      if (
        task.due_at &&
        Date.parse(task.scheduled_end) > Date.parse(task.due_at)
      )
        throw new Error("The proposed schedule ends after the task is due.");
      if (Date.parse(task.scheduled_start) < Date.now())
        throw new Error("AI cannot schedule work in the past.");
    }
    return { ...action, values: task };
  }
  if (
    action.tool === "create_commitment" ||
    action.tool === "update_commitment"
  )
    return { ...action, values: validateCommitment(action.values) };
  if (action.tool === "create_reminder" || action.tool === "update_reminder")
    return { ...action, values: validateReminder(action.values) };
  if (action.tool !== "cancel_reminder") throw new Error("Unsupported action.");
  return action;
}
