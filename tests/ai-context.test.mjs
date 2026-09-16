import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { loadTypeScript } from "./load-typescript.mjs";
const { activityContext } = loadTypeScript("lib/ai-context.ts");
const { dailyProgress, periodProgress } = loadTypeScript(
  "lib/daily-progress.ts",
);
const day = "2026-09-15";
const habit = (id, days = [2]) => ({
  id,
  name: id,
  scheduled_days: days,
  scheduled_time: null,
  duration_minutes: null,
});
const log = (id, status, date = day) => ({
  habit_id: id,
  log_date: date,
  status,
});
const task = (id, status = "pending") => ({
  id,
  title: id,
  description: "",
  user_id: "owner",
  status,
  priority: "normal",
  due_at: `${day}T16:00:00Z`,
  scheduled_start: `${day}T16:00:00Z`,
  scheduled_end: `${day}T17:00:00Z`,
  created_at: "",
  updated_at: "",
});
const fixture = {
  habits: [
    habit("done"),
    habit("todo"),
    habit("rest"),
    habit("vacation"),
    habit("off", [1]),
  ],
  tasks: [
    task("done-task", "completed"),
    task("todo-task"),
    task("cancelled", "cancelled"),
  ],
  commitments: [],
};
const logs = [
  log("done", "complete"),
  log("rest", "rest"),
  log("vacation", "vacation"),
  log("off", "complete"),
];

test("completed and incomplete habit context are explicit and actionable work excludes completed", () => {
  const result = activityContext(fixture, logs, day, "UTC").todayWork;
  assert.equal(result.habits.find((h) => h.id === "done").status, "complete");
  assert.equal(result.habits.find((h) => h.id === "todo").status, "empty");
  assert.deepEqual(
    result.incompleteHabits.map((h) => h.id),
    ["todo"],
  );
  assert.deepEqual(
    result.incompleteTasks.map((t) => t.id),
    ["todo-task"],
  );
});
test("rest/vacation and unscheduled days remain neutral; cancelled tasks excluded", () => {
  const result = activityContext(fixture, logs, day, "UTC").todayWork;
  assert.equal(result.habits.find((h) => h.id === "rest").status, "rest");
  assert.equal(
    result.habits.find((h) => h.id === "vacation").status,
    "vacation",
  );
  assert.equal(result.habits.find((h) => h.id === "off").status, "unscheduled");
  assert.equal(result.tasks.length, 2);
  assert.equal(result.progress.total, 6);
  assert.equal(result.progress.eligible, 4);
  assert.equal(result.progress.completed, 2);
  assert.equal(result.progress.completion, 50);
});
test("missed is explicitly incomplete, without inventing a skipped habit status", () => {
  const result = activityContext(
    { habits: [habit("missed")], tasks: [], commitments: [] },
    [log("missed", "missed")],
    day,
    "UTC",
  ).todayWork;
  assert.equal(result.incompleteHabits[0].status, "missed");
  assert.equal(result.progress.missed, 1);
});
test("integrated task + habit completion is the same 4 of 5 = 80% as DailyProof", () => {
  const calendar = {
    habits: [habit("a"), habit("b"), habit("c")],
    tasks: [task("d", "completed"), task("e")],
    commitments: [],
  };
  const records = ["a", "b", "c"].map((id) => log(id, "complete"));
  const ctx = activityContext(calendar, records, day, "UTC");
  const progress = dailyProgress(
    calendar.habits.map((h) => ({
      scheduledDays: h.scheduled_days,
      logsByDate: { [day]: "complete" },
    })),
    calendar.tasks,
    day,
    "UTC",
  );
  assert.deepEqual(ctx.todayWork.progress, progress);
  assert.equal(progress.completion, 80);
  assert.equal(ctx.week.completion, 80);
  assert.equal(ctx.week.completed, 4);
  assert.equal(ctx.week.eligible, 5);
});
test("weekly percentage weights eligible activity-days and does not average rounded percentages", () => {
  const habits = [
    {
      scheduledDays: [1, 2],
      logsByDate: { "2026-09-14": "complete", [day]: "rest" },
    },
  ];
  const tasks = [task("a"), task("b"), task("c")];
  const progress = periodProgress(habits, tasks, ["2026-09-14", day], "UTC");
  assert.equal(progress.completed, 1);
  assert.equal(progress.eligible, 4);
  assert.equal(progress.completion, 25);
});
test("timezone attribution and DST use the shared task-day rules; empty days remain neutral", () => {
  const calendar = {
    habits: [],
    tasks: [
      {
        ...task("late", "completed"),
        due_at: "2026-09-16T02:00:00Z",
        scheduled_start: null,
        scheduled_end: null,
      },
    ],
    commitments: [],
  };
  assert.equal(
    activityContext(calendar, [], day, "America/Toronto").todayWork.progress
      .completed,
    1,
  );
  assert.equal(
    activityContext(calendar, [], day, "UTC").todayWork.progress.total,
    0,
  );
  calendar.tasks[0].due_at = "2026-03-08T04:30:00Z";
  assert.equal(
    activityContext(calendar, [], "2026-03-07", "America/Toronto").todayWork
      .progress.completed,
    1,
  );
  assert.equal(
    activityContext(calendar, [], "2026-03-08", "America/Toronto").todayWork
      .progress.total,
    0,
  );
});
function compile(file, imports, now = "2026-09-15T16:00:00Z") {
  const loadedModule = { exports: {} };
  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return Date.parse(now);
    }
  }
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    {
      module: loadedModule,
      exports: loadedModule.exports,
      Date: FixedDate,
      require(name) {
        if (name in imports) return imports[name];
        if (name === "server-only") return {};
        if (name.startsWith("@/")) return loadTypeScript(name.slice(2) + ".ts");
        throw new Error(name);
      },
    },
  );
  return loadedModule.exports;
}
function readTools({ fail = false, now } = {}) {
  const queries = [];
  const db = {
    from(table) {
      assert.equal(table, "habit_logs");
      const q = { table, filters: [] };
      queries.push(q);
      const chain = {
        select() {
          return chain;
        },
        eq(k, v) {
          q.filters.push([k, v]);
          return chain;
        },
        gte(k, v) {
          q.start = v;
          return chain;
        },
        lte(k, v) {
          q.end = v;
          return chain;
        },
        then(resolve) {
          return Promise.resolve({
            data: fail
              ? null
              : logs.filter(
                  (l) => l.log_date >= q.start && l.log_date <= q.end,
                ),
            error: fail ? { code: "42501" } : null,
          }).then(resolve);
        },
      };
      return chain;
    },
  };
  const imports = {
    "@/lib/server-user": {
      requireUser: async () => ({
        db,
        user: { id: "owner" },
        timeZone: "America/Toronto",
      }),
    },
    "@/lib/actions/calendar": { getCalendar: async () => fixture },
    "@/lib/actions/reminders": { getReminders: async () => [] },
    "@/lib/gemini": {},
  };
  return { tools: compile("lib/ai-tools.ts", imports, now), queries };
}
test("real AI read tools load owner-scoped logs for today/week in canonical timezone", async () => {
  const { tools, queries } = readTools();
  const today = await tools.readAiTool("get_today", {});
  const week = await tools.readAiTool("get_week_stats", {});
  assert.equal(today.today, day);
  assert.equal(today.incompleteHabits[0].id, "todo");
  assert.equal(week.completed, 2);
  assert.equal(week.eligible, 5);
  assert.equal(week.completion, 40);
  assert.equal(queries[0].start, day);
  assert.equal(queries[1].start, "2026-09-14");
  for (const q of queries) assert.deepEqual(q.filters, [["user_id", "owner"]]);
  const midnight = readTools({ now: "2026-09-15T02:00:00Z" });
  assert.equal(
    (await midnight.tools.readAiTool("get_today", {})).today,
    "2026-09-14",
  );
});
test("failed completion reads fail safely rather than supplying empty unfinished context", async () => {
  const { tools } = readTools({ fail: true });
  for (const name of ["get_today", "get_week_stats"])
    await assert.rejects(
      () => tools.readAiTool(name, {}),
      /Unable to load habit completion context/,
    );
});
test("What should I do next receives actual completion-aware context on the first model request", async () => {
  const { tools } = readTools();
  let captured;
  const ask = compile("lib/actions/assistant.ts", {
    "@/lib/assistant-diagnostics": {
      assistantStage: async (_s, _f, work) => work(),
      diagnoseAssistant: async (work) => ({ ok: true, ...(await work()) }),
    },
    "@/lib/server-user": {
      requireUser: async () => ({
        db: { rpc: async () => ({ error: null }) },
        user: { id: "owner" },
        timeZone: "America/Toronto",
      }),
    },
    "@/lib/ai-tools": tools,
    "@/lib/actions/tasks": { getTasks: async () => fixture.tasks },
    "@/lib/actions/reminders": { getReminders: async () => [] },
    "@/lib/actions/calendar": { getCalendar: async () => fixture },
    "@/lib/gemini": {
      geminiJson: async (prompt) => {
        captured = prompt;
        return { reply: "Work on todo.", reads: [], actions: [] };
      },
    },
  });
  const result = await ask.askAssistant("What should I do next?");
  assert.equal(result.ok, true);
  const context = JSON.parse(
    captured.split("Context and previous tool results: ")[1],
  );
  assert.deepEqual(
    context.todayWork.incompleteHabits.map((h) => h.id),
    ["todo"],
  );
  assert.deepEqual(
    context.todayWork.incompleteTasks.map((t) => t.id),
    ["todo-task"],
  );
  assert.equal(
    context.todayWork.habits.find((h) => h.id === "done").status,
    "complete",
  );
  assert.match(captured, /complete\/completed means finished/);
});
