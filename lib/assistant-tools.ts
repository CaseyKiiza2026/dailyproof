import { localDateTimeToUtc } from "@/lib/timezone";
// One registry drives both the model contract and server-side argument checks.
const text = { type: "string" };
export type AssistantConversation =
  { question: string; reply: string } | { question: string; reply: string }[];
export function assistantConversation(previous?: AssistantConversation) {
  const turns = Array.isArray(previous)
    ? previous.slice(-8)
    : previous
      ? [previous]
      : [];
  return turns
    .filter(
      (turn) =>
        turn &&
        typeof turn.question === "string" &&
        typeof turn.reply === "string",
    )
    .map((turn) => ({
      question: turn.question.slice(0, 4000),
      reply: turn.reply.slice(0, 4000),
    }));
}
// Account identifiers, storage locations and push identities are unnecessary
// for reasoning. Keep them out of every provider context, including tool reads.
export function assistantData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(assistantData);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              "user_id",
              "requester_id",
              "addressee_id",
              "from_user_id",
              "to_user_id",
              "push_alias",
              "storage_path",
              "error",
            ].includes(key),
        )
        .map(([key, item]) => [key, assistantData(item)]),
    );
  return value;
}
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
    const local =
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/.exec(
        value.trim(),
      );
    if (local) {
      const at = localDateTimeToUtc(local[1], timeZone);
      result[key] = new Date(
        Date.parse(at!) +
          Number(local[2] ?? 0) * 1000 +
          Number((local[3] ?? "").padEnd(3, "0")),
      ).toISOString();
    } else if (key === "due_at" && /^\d{4}-\d{2}-\d{2}$/.test(value))
      result[key] = localDateTimeToUtc(`${value}T23:59`, timeZone);
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
const habitFields = {
  name: text,
  category: text,
  is_core: { type: "boolean" },
  scheduled_days: {
    type: "array",
    items: { type: "integer", minimum: 1, maximum: 7 },
    minItems: 1,
    maxItems: 7,
  },
  scheduled_time: { type: ["string", "null"] },
  duration_minutes: { type: ["integer", "null"], minimum: 5, maximum: 720 },
};
type Definition = {
  properties: Record<string, unknown>;
  required: string[];
  existing?: boolean;
};
export const assistantWrites: Record<string, Definition> = {
  delete_all_habits: { properties: {}, required: [] },
  seed_starter_habits: { properties: {}, required: [] },
  create_habit: { properties: habitFields, required: ["name"] },
  update_habit: { properties: habitFields, required: [], existing: true },
  set_habit_time: {
    properties: {
      scheduled_time: habitFields.scheduled_time,
      duration_minutes: habitFields.duration_minutes,
    },
    required: ["scheduled_time", "duration_minutes"],
    existing: true,
  },
  log_habit: {
    properties: {
      log_date: text,
      status: {
        type: "string",
        enum: ["complete", "missed", "rest", "vacation", "empty"],
      },
    },
    required: ["log_date", "status"],
    existing: true,
  },
  delete_habit: { properties: {}, required: [], existing: true },
  delete_task: { properties: {}, required: [], existing: true },
  reopen_task: { properties: {}, required: [], existing: true },
  delete_commitment: { properties: {}, required: [], existing: true },
  add_proof: {
    properties: {
      task_id: identity,
      habit_id: identity,
      log_date: text,
      type: { type: "string", enum: ["note", "link"] },
      content: text,
    },
    required: ["type", "content"],
  },
  delete_proof: { properties: {}, required: [], existing: true },
  send_friend_request: {
    properties: { username: text },
    required: ["username"],
  },
  respond_friend_request: {
    properties: { accept: { type: "boolean" } },
    required: ["accept"],
    existing: true,
  },
  remove_friendship: { properties: {}, required: [], existing: true },
  send_nudge: { properties: {}, required: [], existing: true },
  mark_notification_read: { properties: {}, required: [], existing: true },
  update_notification_settings: {
    properties: {
      enabled: { type: "boolean" },
      daily_time: { type: ["string", "null"] },
      friend_activity: { type: "boolean" },
      nudges: { type: "boolean" },
    },
    required: [],
  },
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
  get_profile: { properties: {}, required: [] },
  get_habit_stats: {
    properties: {
      month: text,
      year: { type: "integer", minimum: 1900, maximum: 2200 },
    },
    required: [],
  },
  get_leaderboard: { properties: {}, required: [] },
  get_circle_activity: {
    properties: { offset: { type: "integer", minimum: 0, maximum: 10000 } },
    required: [],
  },
  get_habits: { properties: {}, required: [] },
  get_habit_logs: {
    properties: {
      offset: { type: "integer", minimum: 0, maximum: 1000000 },
      start_date: text,
      end_date: text,
    },
    required: [],
  },
  get_friends: { properties: {}, required: [] },
  search_profiles: { properties: { query: text }, required: ["query"] },
  get_friend_summary: {
    properties: { friendship_id: text, date: text },
    required: ["friendship_id"],
  },
  get_notifications: { properties: {}, required: [] },
  get_notification_settings: { properties: {}, required: [] },
  get_delivery_status: { properties: {}, required: [] },
  get_proofs: { properties: {}, required: [] },
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
// A single shallow envelope avoids provider schema-state explosions as the
// registry grows. Each selected operation is still validated against its exact
// contract on the server before it can reach any backend function.
function declarations(registry: Record<string, Definition>) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      tool: { type: "string", enum: Object.keys(registry) },
      id: {
        type: "string",
        description:
          "Only existing-record tools: saved UUID from authorized context. Omit for new records.",
      },
      arguments: {
        type: "string",
        description:
          "A JSON-encoded object containing only the fields declared for the selected tool in its exact tool contract. For no arguments use {}. The server parses and validates this object before execution.",
      },
    },
    required: ["tool", "arguments"],
  };
}
export const assistantSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: text,
    request_complete: {
      type: "boolean",
      description:
        "True only if these actions fully satisfy all remaining parts of the request once committed, or this is a complete read-only answer. False if more reads, dependent actions, or clarification are needed.",
    },
    reads: { type: "array", items: declarations(assistantReads) },
    actions: {
      type: "array",
      items: declarations(assistantWrites),
    },
  },
  required: ["reply", "reads", "actions", "request_complete"],
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
  if (
    Object.keys(action).some(
      (key) => !["tool", "id", "arguments"].includes(key),
    )
  )
    throw new Error("Invalid operation fields.");
  if (!definition.existing && action.id !== undefined)
    throw new Error("New record identities are assigned by the server.");
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
      items?: { type: string; minimum: number; maximum: number };
    };
    const types = Array.isArray(field.type) ? field.type : [field.type];
    const type =
      value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
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
      Array.isArray(value) &&
      (!field.items ||
        value.length < 1 ||
        value.length > 7 ||
        value.some(
          (v) =>
            !Number.isInteger(v) ||
            v < field.items!.minimum ||
            v > field.items!.maximum,
        ))
    )
      throw new Error("Invalid scheduled days.");
    if (typeof value === "string" && value.length > 10000)
      throw new Error("Action field is too long.");
    if (
      (key === "task_id" ||
        key === "habit_id" ||
        key === "proof_id" ||
        key === "friendship_id" ||
        key === "exclude_task_id") &&
      value !== null &&
      (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value))
    )
      throw new Error("Invalid linked record identity.");
  }
  return args as Record<string, unknown>;
}
