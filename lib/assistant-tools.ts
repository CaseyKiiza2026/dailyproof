import { localDateTimeToUtc } from "@/lib/timezone";
// One registry drives both the model contract and server-side argument checks.
const text = { type: "string" };
export function resolveAssistantDates(
  args: Record<string, unknown>,
  timeZone: string,
) {
  const result = { ...args };
  for (const key of [
    "due_at",
    "scheduled_start",
    "scheduled_end",
    "scheduled_at",
    "start_at",
    "end_at",
    "start",
    "end",
  ]) {
    const value = result[key];
    if (typeof value !== "string") continue;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
      result[key] = localDateTimeToUtc(value, timeZone);
    else if (
      /(Z|[+-]\d{2}:\d{2})$/.test(value) &&
      Number.isFinite(Date.parse(value))
    )
      result[key] = new Date(value).toISOString();
    else throw new Error("Enter a valid date and time in your saved timezone.");
  }
  return result;
}
const date = {
  type: ["string", "null"],
  description:
    "ISO timestamp with UTC offset, or local YYYY-MM-DDTHH:mm in the saved timezone.",
};
const taskFields = {
  title: text,
  description: text,
  due_at: date,
  scheduled_start: date,
  scheduled_end: date,
  status: { type: "string", enum: ["pending", "completed", "cancelled"] },
  priority: { type: "string", enum: ["low", "normal", "high"] },
};
const commitmentFields = {
  title: text,
  description: text,
  start_at: date,
  end_at: date,
};
const identity = {
  type: ["string", "null"],
  description: "Existing task or habit UUID from context, or null.",
};
const reminderFields = {
  title: text,
  message: text,
  scheduled_at: date,
  task_id: identity,
  habit_id: identity,
  only_if_incomplete: { type: "boolean" },
};
type Definition = {
  properties: Record<string, unknown>;
  required: string[];
  existing?: boolean;
};
export const assistantWrites: Record<string, Definition> = {
  create_task: { properties: taskFields, required: ["title"] },
  update_task: { properties: taskFields, required: [], existing: true },
  complete_task: { properties: {}, required: [], existing: true },
  schedule_task: {
    properties: { scheduled_start: date, scheduled_end: date },
    required: ["scheduled_start", "scheduled_end"],
    existing: true,
  },
  reschedule_task: {
    properties: { scheduled_start: date, scheduled_end: date },
    required: ["scheduled_start", "scheduled_end"],
    existing: true,
  },
  create_commitment: {
    properties: commitmentFields,
    required: ["title", "start_at", "end_at"],
  },
  update_commitment: {
    properties: commitmentFields,
    required: [],
    existing: true,
  },
  create_reminder: {
    properties: reminderFields,
    required: ["title", "scheduled_at"],
  },
  update_reminder: { properties: reminderFields, required: [], existing: true },
  reschedule_reminder: {
    properties: { scheduled_at: date },
    required: ["scheduled_at"],
    existing: true,
  },
  cancel_reminder: { properties: {}, required: [], existing: true },
};
export const assistantReads: Record<string, Definition> = {
  get_today: { properties: {}, required: [] },
  get_tasks: { properties: {}, required: [] },
  get_calendar: { properties: {}, required: [] },
  get_commitments: { properties: {}, required: [] },
  get_progress: { properties: {}, required: [] },
  get_week_stats: { properties: {}, required: [] },
  summarize_weekly_performance: { properties: {}, required: [] },
  get_reminders: { properties: {}, required: [] },
  verify_proof: { properties: { proof_id: text }, required: ["proof_id"] },
  find_free_slots: {
    properties: {
      start: text,
      end: text,
      minutes: { type: "integer", minimum: 5, maximum: 720 },
      exclude_task_id: text,
    },
    required: ["start", "end", "minutes"],
  },
};
function declarations(registry: Record<string, Definition>) {
  return {
    anyOf: Object.entries(registry).map(([tool, definition]) => ({
      type: "object",
      additionalProperties: false,
      properties: {
        tool: { type: "string", enum: [tool] },
        ...(definition.existing
          ? {
              id: {
                type: "string",
                description: "Existing record ID from context.",
              },
            }
          : {}),
        arguments: {
          type: "object",
          properties: definition.properties,
          required: definition.required,
          additionalProperties: false,
        },
      },
      required: ["tool", "arguments", ...(definition.existing ? ["id"] : [])],
    })),
  };
}
export const assistantSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: text,
    reads: { type: "array", items: declarations(assistantReads), maxItems: 8 },
    actions: {
      type: "array",
      items: declarations(assistantWrites),
      maxItems: 20,
    },
  },
  required: ["reply", "reads", "actions"],
};
export interface ModelAction {
  tool: string;
  id?: string;
  arguments: unknown;
}
export function parseAssistantArguments(
  action: ModelAction,
  registry: Record<string, Definition>,
) {
  const definition = Object.hasOwn(registry, action?.tool)
    ? registry[action.tool]
    : undefined;
  if (!definition) throw new Error("Unsupported assistant operation.");
  const args =
    typeof action.arguments === "string"
      ? JSON.parse(action.arguments)
      : action.arguments;
  if (!args || typeof args !== "object" || Array.isArray(args))
    throw new Error("Invalid proposed arguments.");
  if (
    Object.keys(args).some(
      (key) => !Object.hasOwn(definition.properties, key),
    ) ||
    definition.required.some((key) => !Object.hasOwn(args, key))
  )
    throw new Error("Invalid or missing action fields.");
  if (
    definition.existing &&
    (typeof action.id !== "string" || !/^[0-9a-f-]{36}$/i.test(action.id))
  )
    throw new Error("An existing record is required for this action.");
  for (const [key, value] of Object.entries(args)) {
    const field = definition.properties[key] as {
      type: string | string[];
      enum?: unknown[];
      minimum?: number;
      maximum?: number;
    };
    const types = Array.isArray(field.type) ? field.type : [field.type];
    const type = value === null ? "null" : typeof value;
    if (
      !types.includes(type) &&
      !(types.includes("integer") && Number.isInteger(value))
    )
      throw new Error("Invalid action field type.");
    if (field.enum && !field.enum.includes(value))
      throw new Error("Invalid action field value.");
    if (
      typeof value === "number" &&
      ((field.minimum !== undefined && value < field.minimum) ||
        (field.maximum !== undefined && value > field.maximum))
    )
      throw new Error("Invalid action field range.");
    if (
      (key === "task_id" ||
        key === "habit_id" ||
        key === "proof_id" ||
        key === "exclude_task_id") &&
      value !== null &&
      (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value))
    )
      throw new Error("Invalid linked record identity.");
  }
  return args as Record<string, unknown>;
}
