import { validateProof } from "@/lib/proofs";
import {
  assistantWrites,
  parseAssistantArguments,
} from "@/lib/assistant-tools";

export const appOperationNames = [
  "delete_all_habits",
  "seed_starter_habits",
  "create_habit",
  "update_habit",
  "set_habit_time",
  "log_habit",
  "delete_habit",
  "delete_task",
  "delete_commitment",
  "add_proof",
  "delete_proof",
  "send_friend_request",
  "respond_friend_request",
  "remove_friendship",
  "send_nudge",
  "mark_notification_read",
  "update_notification_settings",
] as const;
export type AppOperationName = (typeof appOperationNames)[number];
export interface AppOperation {
  tool: AppOperationName;
  id: string;
  values: Record<string, unknown>;
}
export function isAppOperation(tool: string): tool is AppOperationName {
  return (appOperationNames as readonly string[]).includes(tool);
}
export function validateAppOperation(action: AppOperation): AppOperation {
  const values = parseAssistantArguments(
    {
      tool: action.tool,
      ...(assistantWrites[action.tool].existing ? { id: action.id } : {}),
      arguments: action.values,
    },
    assistantWrites,
  );
  if (action.tool === "create_habit" || action.tool === "update_habit") {
    if (
      typeof values.name !== "string" ||
      !values.name.trim() ||
      values.name.length > 200 ||
      typeof values.category !== "string" ||
      values.category.length > 100 ||
      typeof values.is_core !== "boolean" ||
      !Array.isArray(values.scheduled_days)
    )
      throw new Error("Invalid habit details.");
    values.name = values.name.trim();
  }
  if (
    ["create_habit", "update_habit", "set_habit_time"].includes(action.tool)
  ) {
    if (
      values.scheduled_time !== null &&
      (typeof values.scheduled_time !== "string" ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.scheduled_time) ||
        !Number.isInteger(values.duration_minutes) ||
        Number(values.duration_minutes) < 5 ||
        Number(values.duration_minutes) > 720)
    )
      throw new Error("Enter a habit time and duration of 5–720 minutes.");
    if (values.scheduled_time === null) values.duration_minutes = null;
  }
  if (
    action.tool === "log_habit" &&
    (typeof values.log_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(values.log_date))
  )
    throw new Error("Invalid habit date.");
  if (action.tool === "add_proof") {
    validateProof(String(values.type), String(values.content));
    if (Boolean(values.task_id) === Boolean(values.habit_id))
      throw new Error("Choose one proof target.");
    if (
      values.habit_id &&
      (typeof values.log_date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(values.log_date))
    )
      throw new Error("A habit proof requires a date.");
  }
  if (
    action.tool === "send_friend_request" &&
    (typeof values.username !== "string" ||
      !values.username.trim() ||
      values.username.length > 100)
  )
    throw new Error("Enter a username.");
  if (
    action.tool === "update_notification_settings" &&
    values.daily_time !== undefined &&
    values.daily_time !== null &&
    (typeof values.daily_time !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(values.daily_time))
  )
    throw new Error("Invalid daily notification time.");
  return { ...action, values };
}
export function requiresAssistantConfirmation(
  actions: { tool: string }[],
  question: string,
) {
  const destructive = actions.filter(
    (a) => a.tool.startsWith("delete_") || a.tool === "remove_friendship",
  );
  return (
    destructive.some((a) => a.tool === "delete_all_habits") ||
    destructive.length > 1 ||
    (destructive.length > 0 &&
      /\b(all|every|everything|entire|clear|wipe|purge)\b/i.test(question))
  );
}
