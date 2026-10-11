import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { p0Database } from "./p0-database.mjs";
import { loadTypeScript } from "./load-typescript.mjs";
const require = createRequire(import.meta.url);
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const { assistantWrites, assistantReads, parseAssistantArguments } =
  loadTypeScript("lib/assistant-tools.ts");
test("Assistant registry covers V1 operations and rejects unrestricted fields", () => {
  for (const name of [
    "create_task",
    "update_task",
    "complete_task",
    "schedule_task",
    "reschedule_task",
    "create_commitment",
    "update_commitment",
    "create_reminder",
    "update_reminder",
    "reschedule_reminder",
  ])
    assert.ok(assistantWrites[name]);
  for (const name of [
    "get_today",
    "get_tasks",
    "get_calendar",
    "get_commitments",
    "find_free_slots",
    "get_progress",
    "summarize_weekly_performance",
    "verify_proof",
  ])
    assert.ok(assistantReads[name]);
  for (const action of [
    { tool: "delete_account", arguments: {} },
    { tool: "create_task", arguments: { title: "A", user_id: other } },
    { tool: "create_task", arguments: { title: 42 } },
    { tool: "create_task", arguments: [] },
  ])
    assert.throws(() => parseAssistantArguments(action, assistantWrites));
});

// The actual server actions and PostgreSQL functions run against isolated data.
// Only provider and Supabase transport boundaries are adapted.
function harness(database, live = false) {
  const models = [],
    prompts = [],
    errors = [],
    modules = new Map();
  let failApply = false,
    diagnosticDepth = 0;
  const db = {
    rpc: async (name, args) => {
      if (name === "apply_ai_plan" && failApply)
        return { error: { code: "08006" }, data: null };
      try {
        const values =
          name === "apply_ai_plan" || name === "retry_assistant_run"
            ? [args.p_id]
            : name === "apply_work_actions"
              ? [JSON.stringify(args.p_actions)]
              : [];
        const result = await database.query(
          `select public.${name}(${values.length ? "$1" : ""}) as result`,
          values,
        );
        return { data: result.rows[0].result, error: null };
      } catch (error) {
        errors.push(error.message);
        return { data: null, error };
      }
    },
    from(table) {
      let columns = "*",
        insert,
        update,
        limit,
        offset = 0,
        filters = [],
        single = false;
      const chain = {
        select(value = "*") {
          columns = value;
          return chain;
        },
        insert(value) {
          insert = value;
          return chain;
        },
        update(value) {
          update = value;
          return chain;
        },
        limit(value) {
          limit = value;
          return chain;
        },
        range(start, end) {
          offset = start;
          limit = end - start + 1;
          return chain;
        },
        gte(key, value) {
          filters.push([key, value, ">="]);
          return chain;
        },
        lte(key, value) {
          filters.push([key, value, "<="]);
          return chain;
        },
        eq(key, value) {
          filters.push([key, value]);
          return chain;
        },
        order() {
          return chain;
        },
        single() {
          single = true;
          return chain;
        },
        then(resolve, reject) {
          return (async () => {
            try {
              let query, params;
              if (insert) {
                const keys = Object.keys(insert);
                params = Object.values(insert).map((v) =>
                  typeof v === "object" ? JSON.stringify(v) : v,
                );
                query = `insert into ${table}(${keys.join(",")}) values(${keys.map((_, i) => `$${i + 1}`).join(",")}) returning ${columns}`;
              } else if (update) {
                const keys = Object.keys(update);
                params = [
                  ...Object.values(update).map((v) =>
                    typeof v === "object" ? JSON.stringify(v) : v,
                  ),
                  ...filters.map((f) => f[1]),
                ];
                query = `update ${table} set ${keys.map((key, i) => `${key}=$${i + 1}`).join(",")} where ${filters.map(([key], i) => `${key}=$${keys.length + i + 1}`).join(" and ")} returning ${columns}`;
              } else {
                params = filters.map((f) => f[1]);
                query = `select ${columns} from ${table}${filters.length ? " where " + filters.map(([key, , op], i) => `${key}${op ?? "="}$${i + 1}`).join(" and ") : ""}${limit ? ` limit ${limit}` : ""}${offset ? ` offset ${offset}` : ""}`;
              }
              const { rows } = await database.query(query, params);
              // Match Supabase timestamp serialization.
              const data = JSON.parse(JSON.stringify(rows));
              return { data: single ? data[0] : data, error: null };
            } catch (error) {
              return { data: null, error };
            }
          })().then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const overrides = {
    "server-only": {},
    "@/lib/server-user": {
      requireUser: async () => ({
        db,
        user: { id: owner },
        timeZone: "America/Toronto",
      }),
    },
    "@/lib/gemini": {
      geminiJson: async (prompt, schema) => {
        prompts.push({ prompt, schema });
        if (live) {
          const pacing = Number(process.env.DAILYPROOF_LIVE_PACING_MS ?? 0);
          if (pacing)
            await new Promise((resolve) => setTimeout(resolve, pacing));
          return compile("lib/gemini.ts").geminiJson(prompt, schema);
        }
        assert.ok(models.length, "Unexpected provider call");
        const model = models.shift();
        return typeof model === "function" ? await model(prompt) : model;
      },
    },
    "@/lib/ai-tools": {
      readAiTool: async (name, args) =>
        name === "get_today"
          ? { incompleteTasks: [], incompleteHabits: [] }
          : compile("lib/ai-tools.ts").readAiTool(name, args),
      verifyOwnedProof: async () => ({ verification: "likely" }),
    },
    "@/lib/assistant-diagnostics": {
      geminiCorrelationId: () => randomUUID(),
      logGeminiEvent: (event, details) => {
        if (live) console.info(JSON.stringify({ event, ...details }));
      },
      assistantStage: async (_s, _f, run) => run(),
      diagnoseAssistant: async (run) => {
        const nested = diagnosticDepth++ > 0;
        try {
          return { ok: true, ...(await run()) };
        } catch (error) {
          if (nested || live) return { ok: false, error: error.message };
          throw error;
        } finally {
          diagnosticDepth--;
        }
      },
    },
  };
  function compile(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const loaded = { exports: {} };
    modules.set(file, loaded);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
      crypto: { randomUUID },
      Date,
      console,
      process,
      Buffer,
      AbortSignal,
      URL,
      fetch: async (...args) => {
        const response = await fetch(...args);
        if (live && response.status === 429) {
          fs.mkdirSync("out", { recursive: true });
          fs.writeFileSync(
            "out/assistant-live-quota-blocked.json",
            JSON.stringify({
              status: "blocked",
              reason: "Gemini quota exhausted",
              recordedAt: new Date().toISOString(),
            }),
          );
        }
        if (live && !response.ok) {
          const body = await response
            .clone()
            .json()
            .catch(() => ({}));
          const message = String(body.error?.message ?? "");
          // Only classify provider diagnostics; never print response bodies.
          console.info(
            JSON.stringify({
              providerStatus: response.status,
              schemaComplexity: /too many states|complex|nesting/i.test(
                message,
              ),
              schemaInvalid: /schema|anyOf|additionalProperties|enum/i.test(
                message,
              ),
              credentialError: /API key|permission|billing/i.test(message),
              modelUnavailable: /not found|not supported|model/i.test(message),
              invalidArgument: /invalid argument/i.test(message),
              diagnosticLength: message.length,
              detailTypes: body.error?.details?.map((d) => d["@type"]),
            }),
          );
        }
        return response;
      },
    })(
      (name) =>
        Object.hasOwn(overrides, name)
          ? overrides[name]
          : name.startsWith("@/")
            ? compile(name.slice(2) + ".ts")
            : require(name),
      loaded,
      loaded.exports,
    );
    return loaded.exports;
  }
  const api = compile("lib/actions/assistant.ts");
  return {
    api,
    provider: (...args) => compile("lib/gemini.ts").geminiJson(...args),
    read: (...args) => compile("lib/ai-tools.ts").readAiTool(...args),
    prompts,
    errors,
    enqueue(...responses) {
      models.push(...responses);
    },
    fail(value) {
      failApply = value;
    },
    async propose(actions, question = "Make the requested changes") {
      models.push({ reply: "Review these changes.", reads: [], actions });
      return api.askAssistant(question);
    },
    clarify() {
      models.push({
        reply: "Which appointment do you mean?",
        reads: [],
        actions: [],
      });
      return api.askAssistant("Move my appointment");
    },
  };
}
const action = (tool, args, id) => ({
  tool,
  arguments: args,
  ...(id ? { id } : {}),
});
test(
  "Live Gemini natural language against isolated PostgreSQL only",
  { skip: process.env.DAILYPROOF_ASSISTANT_LIVE !== "1" },
  async () => {
    assert.ok(
      process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL,
      "Live verification requires Gemini configuration",
    );
    const database = await p0Database();
    try {
      await database.query("insert into auth.users(id) values($1)", [owner]);
      await database.query(
        "insert into user_preferences(user_id,timezone) values($1,'America/Toronto')",
        [owner],
      );
      await database.query(
        "select set_config('request.jwt.claim.sub',$1,false)",
        [owner],
      );
      await database.exec("set role authenticated");
      const h = harness(database, true);
      const probe = await h.provider("Return an object with ok true.", {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
      });
      assert.equal(
        probe.ok,
        true,
        "Provider must accept a minimal structured response",
      );
      const created = await h.api.runAssistant(
        "Create a reading habit for weekdays at 8 p.m.",
        randomUUID(),
      );
      assert.equal(created.applied, true, created.reply);
      const habit = (
        await database.query(
          "select * from habits where lower(name) like '%read%'",
        )
      ).rows[0];
      assert.ok(habit);
      assert.deepEqual(habit.scheduled_days, [1, 2, 3, 4, 5]);
      assert.equal(habit.scheduled_time, "20:00:00");
      const reminder = await h.api.runAssistant(
        "Add a reminder to my reading habit 30 minutes before it starts on January 5, 2099.",
        randomUUID(),
      );
      assert.equal(reminder.applied, true, reminder.reply);
      const row = (
        await database.query("select * from reminders where habit_id=$1", [
          habit.id,
        ])
      ).rows[0];
      assert.ok(row);
      assert.equal(
        new Date(row.scheduled_at).toISOString(),
        "2099-01-06T00:30:00.000Z",
      );
      await database.query(
        "insert into tasks(user_id,title,due_at,status) values($1,'Python','2099-01-09T17:00Z','pending'),($1,'Laundry','2099-01-09T19:00Z','pending'),($1,'Finished task','2099-01-01T12:00Z','completed')",
        [owner],
      );
      const python = (
        await database.query("select id from tasks where title='Python'")
      ).rows[0];
      await database.query(
        "insert into reminders(user_id,task_id,title,scheduled_at) values($1,$2,'Python reminder','2099-01-09T16:30Z')",
        [owner, python.id],
      );
      const moved = await h.api.runAssistant(
        "Change my Python task to Saturday January 10, 2099 at 10 a.m. for one hour and update its reminder to 30 minutes before. Also change its due date to the end of that Saturday.",
        randomUUID(),
      );
      assert.equal(moved.applied, true, moved.reply);
      const movedTask = (
        await database.query("select * from tasks where id=$1", [python.id])
      ).rows[0];
      assert.equal(
        new Date(movedTask.scheduled_start).toISOString(),
        "2099-01-10T15:00:00.000Z",
      );
      const movedReminder = (
        await database.query("select * from reminders where task_id=$1", [
          python.id,
        ])
      ).rows[0];
      assert.equal(
        new Date(movedReminder.scheduled_at).toISOString(),
        "2099-01-10T14:30:00.000Z",
      );
      const tomorrow = (
        await database.query(
          "select ((now() at time zone 'America/Toronto')::date+1)::text as day",
        )
      ).rows[0].day;
      const unfinished = await h.api.runAssistant(
        "Move my unfinished tasks to tomorrow. Clear any existing exact-time schedule and cancel reminders that no longer match. Leave completed tasks unchanged.",
        randomUUID(),
      );
      assert.equal(unfinished.applied, true, unfinished.reply);
      const pending = (
        await database.query(
          "select (due_at at time zone 'America/Toronto')::date::text as day,scheduled_start from tasks where status='pending'",
        )
      ).rows;
      assert.equal(pending.length, 2);
      for (const task of pending) {
        assert.equal(task.day, tomorrow);
        assert.equal(task.scheduled_start, null);
      }
      assert.equal(
        (
          await database.query(
            "select status from tasks where title='Finished task'",
          )
        ).rows[0].status,
        "completed",
      );
    } finally {
      await database.close();
    }
  },
);
test("Delete existing work then reuse its slot persists atomically; new habit conflicts roll back", async () => {
  const database = await p0Database();
  try {
    await database.query("insert into auth.users(id) values($1)", [owner]);
    await database.query(
      "insert into user_preferences(user_id,timezone) values($1,'America/Toronto')",
      [owner],
    );
    await database.query(
      "select set_config('request.jwt.claim.sub',$1,false)",
      [owner],
    );
    await database.exec("set role authenticated");
    const existing = (
      await database.query(
        "insert into tasks(user_id,title,scheduled_start,scheduled_end) values($1,'Old work','2099-01-05T15:00Z','2099-01-05T16:00Z') returning id",
        [owner],
      )
    ).rows[0].id;
    const h = harness(database);
    h.enqueue({
      reply: "Replace old work",
      reads: [],
      request_complete: true,
      actions: [
        action("create_task", {
          title: "New work",
          scheduled_start: "2099-01-05T10:00",
          scheduled_end: "2099-01-05T11:00",
        }),
        action("delete_task", {}, existing),
      ],
    });
    const result = await h.api.runAssistant(
      "Delete Old work and schedule New work at the same time",
      randomUUID(),
    );
    assert.equal(result.applied, true, result.reply);
    assert.equal(result.savedCount, 2);
    assert.equal(
      (await database.query("select id from tasks where id=$1", [existing]))
        .rows.length,
      0,
    );
    assert.equal(
      (await database.query("select title from tasks")).rows[0].title,
      "New work",
    );

    h.enqueue({
      reply: "Conflicting batch",
      reads: [],
      request_complete: true,
      actions: [
        action("create_task", {
          title: "Conflicting task",
          scheduled_start: "2099-01-05T12:00",
          scheduled_end: "2099-01-05T13:00",
        }),
        action("create_habit", {
          name: "New timed habit",
          scheduled_time: "12:00",
          duration_minutes: 60,
        }),
      ],
    });
    const conflict = await h.api.runAssistant(
      "Create a timed habit and task at noon",
      randomUUID(),
    );
    assert.equal(conflict.blocked, true);
    assert.equal(conflict.savedCount, 0);
    assert.equal((await database.query("select * from habits")).rows.length, 0);
    assert.equal((await database.query("select * from tasks")).rows.length, 1);
    // Also verify direct RPC enforcement when preflight checks are skipped.
    await assert.rejects(
      () =>
        database.query("select apply_work_actions($1::jsonb)", [
          JSON.stringify([
            {
              tool: "create_habit",
              id: randomUUID(),
              values: {
                name: "Blocked habit",
                category: "Discipline",
                is_core: true,
                scheduled_days: [1, 2, 3, 4, 5, 6, 7],
                scheduled_time: "12:00",
                duration_minutes: 60,
              },
            },
            {
              tool: "create_task",
              id: randomUUID(),
              values: {
                title: "Blocked task",
                description: "",
                due_at: null,
                status: "pending",
                priority: "normal",
                scheduled_start: "2099-01-05T17:00Z",
                scheduled_end: "2099-01-05T18:00Z",
              },
            },
          ]),
        ]),
      /recurring habit/,
    );
    assert.equal((await database.query("select * from habits")).rows.length, 0);
  } finally {
    await database.close();
  }
});

test("Move unfinished tasks to canonical tomorrow and cancel obsolete reminders; preserve completed and foreign work", async () => {
  const database = await p0Database();
  try {
    await database.query("insert into auth.users(id) values($1),($2)", [
      owner,
      other,
    ]);
    await database.query(
      "insert into user_preferences(user_id,timezone) values($1,'America/Toronto'),($2,'UTC')",
      [owner, other],
    );
    await database.query(
      "select set_config('request.jwt.claim.sub',$1,false)",
      [owner],
    );
    await database.query(
      "insert into tasks(user_id,title,status,due_at) values($1,'Python','pending','2099-01-04T17:00Z'),($1,'Laundry','pending','2099-01-04T17:00Z'),($1,'Finished','completed','2099-01-04T17:00Z'),($2,'Foreign','pending','2099-01-04T17:00Z')",
      [owner, other],
    );
    const pending = (
      await database.query(
        "select id from tasks where user_id=$1 and status='pending'",
        [owner],
      )
    ).rows;
    const reminder = (
      await database.query(
        "insert into reminders(user_id,task_id,title,scheduled_at) values($1,$2,'Old reminder','2099-01-04T16:30Z') returning id",
        [owner, pending[0].id],
      )
    ).rows[0].id;
    await database.exec("set role authenticated");
    const tomorrow = (
      await database.query(
        "select ((now() at time zone 'America/Toronto')::date+1)::text as day",
      )
    ).rows[0].day;
    const h = harness(database);
    h.enqueue(
      {
        reply: "Checking unfinished tasks",
        reads: [action("get_tasks", {}), action("get_reminders", {})],
        actions: [],
      },
      (prompt) => {
        assert.ok(prompt.includes("Python") && prompt.includes("Laundry"));
        assert.ok(!prompt.includes("Foreign"));
        return {
          reply: "Move pending work",
          reads: [],
          request_complete: true,
          actions: [
            ...pending.map(({ id }) =>
              action(
                "update_task",
                {
                  due_at: tomorrow,
                  scheduled_start: null,
                  scheduled_end: null,
                },
                id,
              ),
            ),
            action("cancel_reminder", {}, reminder),
          ],
        };
      },
    );
    const key = randomUUID();
    const result = await h.api.runAssistant(
      "Move my unfinished tasks to tomorrow and cancel reminders that no longer match",
      key,
    );
    assert.equal(result.applied, true, result.reply);
    assert.equal(result.savedCount, 3);
    const tasks = (
      await database.query(
        "select title,(due_at at time zone 'America/Toronto')::date::text as day from tasks",
      )
    ).rows;
    assert.ok(
      tasks
        .filter((task) => task.title !== "Finished")
        .every((task) => task.day === tomorrow),
    );
    assert.equal(
      tasks.find((task) => task.title === "Finished").day,
      "2099-01-04",
    );
    assert.equal(
      (
        await database.query("select status from reminders where id=$1", [
          reminder,
        ])
      ).rows[0].status,
      "cancelled",
    );
    const calls = h.prompts.length;
    await h.api.runAssistant(
      "Move my unfinished tasks to tomorrow and cancel reminders that no longer match",
      key,
    );
    assert.equal(h.prompts.length, calls);
    await database.exec("reset role");
    assert.equal(
      new Date(
        (
          await database.query(
            "select due_at::text from tasks where user_id=$1",
            [other],
          )
        ).rows[0].due_at,
      ).toISOString(),
      "2099-01-04T17:00:00.000Z",
    );
  } finally {
    await database.close();
  }
});

test("Automatic natural-language execution persists new features, bounds work, confirms destruction and deduplicates retries", async (t) => {
  const database = await p0Database();
  try {
    // The baseline fixture omits the existing app's public username read grant.
    await database.exec(
      "grant select(id,username) on profiles to authenticated",
    );
    await database.query("insert into auth.users(id) values($1),($2)", [
      owner,
      other,
    ]);
    await database.query(
      "insert into profiles(id,username) values($1,'alice'),($2,'bob')",
      [owner, other],
    );
    await database.query(
      "insert into user_preferences(user_id,timezone) values($1,'America/Toronto'),($2,'UTC')",
      [owner, other],
    );
    await database.query(
      "select set_config('request.jwt.claim.sub',$1,false)",
      [owner],
    );
    await database.exec("set role authenticated");
    const h = harness(database);
    const reply = (actions) => ({
      reply: "Requested changes",
      reads: [],
      actions,
    });
    const done = {
      reply: "The requested changes were saved.",
      reads: [],
      actions: [],
    };
    let habitId, taskId;
    await t.test(
      "Create a reading habit for weekdays at 8 p.m. executes without Apply",
      async () => {
        h.enqueue(
          reply([
            action("create_habit", {
              name: "Reading",
              scheduled_days: [1, 2, 3, 4, 5],
              scheduled_time: "20:00",
              duration_minutes: 30,
            }),
          ]),
          done,
        );
        const requestId = randomUUID();
        const result = await h.api.runAssistant(
          "Create a reading habit for weekdays at 8 p.m.",
          requestId,
        );
        assert.equal(result.ok, true);
        assert.equal(result.applied, true);
        habitId = result.actions[0].id;
        const habit = (
          await database.query("select * from habits where id=$1", [habitId])
        ).rows[0];
        assert.deepEqual(habit.scheduled_days, [1, 2, 3, 4, 5]);
        assert.equal(habit.scheduled_time, "20:00:00");
        const count = h.prompts.length;
        await h.api.runAssistant(
          "Create a reading habit for weekdays at 8 p.m.",
          requestId,
        );
        assert.equal(h.prompts.length, count);
        assert.equal(
          (await database.query("select * from habits")).rows.length,
          1,
        );
      },
    );
    await t.test(
      "Create a habit then add a reminder resolves the newly persisted identity",
      async () => {
        h.enqueue(
          reply([
            action("create_habit", {
              name: "Gym",
              scheduled_time: "18:00",
              duration_minutes: 60,
            }),
          ]),
          async (prompt) => {
            const gym = (
              await database.query("select * from habits where name='Gym'")
            ).rows[0];
            assert.ok(
              prompt.includes(gym.id),
              "completed actions carry newly persisted IDs",
            );
            return reply([
              action("create_reminder", {
                title: "Gym",
                habit_id: gym.id,
                scheduled_at: "2099-01-05T17:30",
              }),
            ]);
          },
          done,
        );
        const result = await h.api.runAssistant(
          "Create a gym habit at 6 p.m. and remind me 30 minutes before it starts on January 5, 2099",
          randomUUID(),
        );
        assert.equal(result.actions.length, 2);
        const reminder = (await database.query("select * from reminders"))
          .rows[0];
        assert.equal(
          new Date(reminder.scheduled_at).toISOString(),
          "2099-01-05T22:30:00.000Z",
        );
        assert.equal(reminder.habit_id, result.actions[0].id);
      },
    );
    await t.test(
      "Move a task and update its reminder commits one coordinated transaction",
      async () => {
        const plan = await h.propose([
          action("create_task", {
            title: "Python",
            due_at: "2099-01-09T23:59",
          }),
        ]);
        taskId = plan.actions[0].id;
        await h.api.approveAssistantPlan(plan.planId);
        h.enqueue(
          reply([
            action(
              "update_task",
              {
                scheduled_start: "2099-01-10T10:00",
                scheduled_end: "2099-01-10T11:00",
                due_at: "2099-01-10T23:59",
              },
              taskId,
            ),
            action("create_reminder", {
              title: "Python",
              task_id: taskId,
              scheduled_at: "2099-01-10T09:30",
            }),
          ]),
          done,
        );
        const result = await h.api.runAssistant(
          "Move my Python task to Saturday at 10 a.m. and remind me 30 minutes before",
          randomUUID(),
        );
        assert.equal(result.applied, true);
        assert.equal(
          new Date(
            (await database.query("select * from tasks where id=$1", [taskId]))
              .rows[0].scheduled_start,
          ).toISOString(),
          "2099-01-10T15:00:00.000Z",
        );
      },
    );
    await t.test(
      "Complete then attach private proof, reopen, and delete the proof",
      async () => {
        h.enqueue(
          reply([
            action("complete_task", {}, taskId),
            action("add_proof", {
              task_id: taskId,
              type: "note",
              content: "Finished chapter two",
            }),
          ]),
          done,
        );
        const result = await h.api.runAssistant(
          "Complete Python and attach a note saying Finished chapter two",
          randomUUID(),
        );
        assert.equal(result.applied, true);
        const proof = (await database.query("select * from proofs")).rows[0];
        assert.equal(proof.visibility, "private");
        h.enqueue(
          reply([
            action("delete_proof", {}, proof.id),
            action("reopen_task", {}, taskId),
          ]),
          done,
        );
        await h.api.runAssistant(
          "Remove that proof note and reopen Python",
          randomUUID(),
        );
        assert.equal(
          (await database.query("select * from proofs")).rows.length,
          0,
        );
        assert.equal(
          (
            await database.query("select status from tasks where id=$1", [
              taskId,
            ])
          ).rows[0].status,
          "pending",
        );
      },
    );
    await t.test(
      "Habit edits, timezone-aware check-ins and undo persist",
      async () => {
        const today = (
          await database.query(
            "select (now() at time zone 'America/Toronto')::date::text as today",
          )
        ).rows[0].today;
        h.enqueue(
          reply([
            action(
              "update_habit",
              { name: "Read books", scheduled_days: [1, 3, 5] },
              habitId,
            ),
            action(
              "log_habit",
              { log_date: today, status: "complete" },
              habitId,
            ),
          ]),
          done,
        );
        assert.equal(
          (
            await h.api.runAssistant(
              "Rename Reading to Read books on Monday Wednesday Friday and mark it complete today",
              randomUUID(),
            )
          ).applied,
          true,
        );
        assert.equal(
          (
            await database.query(
              "select status from habit_logs where habit_id=$1",
              [habitId],
            )
          ).rows[0].status,
          "complete",
        );
        const statistics = await h.read("get_habit_stats", {});
        assert.ok(statistics.stats.bestStreak >= 0);
        assert.ok(statistics.days.some((day) => day.date === today));
        h.enqueue(
          reply([
            action("log_habit", { log_date: today, status: "empty" }, habitId),
          ]),
          done,
        );
        await h.api.runAssistant("Undo today's reading check-in", randomUUID());
        assert.equal(
          (
            await database.query("select * from habit_logs where habit_id=$1", [
              habitId,
            ])
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "Friends and notification preferences use narrow signed-in operations",
      async () => {
        h.enqueue(
          reply([
            action("send_friend_request", { username: "bob" }),
            action("update_notification_settings", {
              enabled: true,
              daily_time: "20:00",
              nudges: false,
            }),
          ]),
          done,
        );
        const friendResult = await h.api.runAssistant(
          "Add bob and set my daily reminder for 8 p.m.; disable nudges",
          randomUUID(),
        );
        assert.equal(
          friendResult.applied,
          true,
          JSON.stringify({ friendResult, errors: h.errors }),
        );
        const friendship = (await database.query("select * from friendships"))
          .rows[0];
        await assert.rejects(() =>
          database.query("select apply_work_actions($1)", [
            JSON.stringify([
              {
                tool: "respond_friend_request",
                id: friendship.id,
                values: { accept: true },
              },
            ]),
          ]),
        );
        await database.query(
          "select set_config('request.jwt.claim.sub',$1,false)",
          [other],
        );
        await database.query("select apply_work_actions($1)", [
          JSON.stringify([
            {
              tool: "respond_friend_request",
              id: friendship.id,
              values: { accept: true },
            },
          ]),
        ]);
        await database.query(
          "select set_config('request.jwt.claim.sub',$1,false)",
          [owner],
        );
        h.enqueue(reply([action("send_nudge", {}, friendship.id)]), done);
        const requestId = randomUUID();
        await h.api.runAssistant("Nudge bob", requestId);
        await h.api.runAssistant("Nudge bob", requestId);
        assert.equal(
          (await database.query("select * from nudges")).rows.length,
          1,
        );
        const settings = (
          await database.query(
            "select * from notification_settings where user_id=$1",
            [owner],
          )
        ).rows[0];
        assert.equal(settings.nudges, false);
        assert.equal(settings.daily_time, "20:00:00");
      },
    );
    await t.test(
      "Ambiguity asks a question without writes and preserves conversation",
      async () => {
        h.enqueue({
          reply: "Which habit do you mean?",
          reads: [],
          actions: [],
        });
        const result = await h.api.runAssistant(
          "Move that habit",
          randomUUID(),
          { question: "Change a habit", reply: "Which habit?" },
        );
        assert.equal(result.planId, null);
        assert.equal(result.actions.length, 0);
        assert.match(result.reply, /Which habit/);
      },
    );
    await t.test(
      "Bulk deletion waits for explicit approval; ordinary single deletion executes",
      async () => {
        h.enqueue(reply([action("delete_all_habits", {})]));
        const result = await h.api.runAssistant(
          "Delete all my habits",
          randomUUID(),
        );
        assert.ok(result.planId);
        assert.equal(
          (await database.query("select * from habits")).rows.length,
          2,
        );
        await database.query(
          "insert into habits(user_id,name,category) values($1,'Added after review','Discipline')",
          [owner],
        );
        await assert.rejects(
          () => h.api.approveAssistantPlan(result.planId),
          /could not be applied/,
        );
        assert.equal(
          (await database.query("select * from habits")).rows.length,
          3,
          "a stale bulk review never deletes new habits",
        );
        const fresh = await h.propose([action("delete_all_habits", {})]);
        await h.api.approveAssistantPlan(fresh.planId);
        await h.api.approveAssistantPlan(fresh.planId);
        assert.equal(
          (await database.query("select * from habits")).rows.length,
          0,
        );
        h.enqueue(reply([action("delete_task", {}, taskId)]), done);
        await h.api.runAssistant("Delete my Python task", randomUUID());
        assert.equal(
          (await database.query("select * from tasks where id=$1", [taskId]))
            .rows.length,
          0,
        );
      },
    );
    await t.test(
      "A provider failure before any plan is retryable with the same request key",
      async () => {
        const key = randomUUID();
        h.enqueue(() => {
          throw new Error("Synthetic provider outage");
        });
        const failed = await h.api.runAssistant("Add a retry-safe task", key);
        assert.equal(failed.savedCount, 0);
        assert.equal(failed.blocked, true);
        h.enqueue(
          reply([action("create_task", { title: "Retry-safe" })]),
          done,
        );
        assert.equal(
          (await h.api.runAssistant("Add a retry-safe task", key)).applied,
          true,
        );
        await h.api.runAssistant("Add a retry-safe task", key);
        assert.equal(
          (await database.query("select * from tasks where title='Retry-safe'"))
            .rows.length,
          1,
        );
      },
    );
    await t.test(
      "Foreign record access is rejected, retries do not replay, and partial completion is accurate",
      async () => {
        h.enqueue(
          reply([action("create_task", { title: "Persist first" })]),
          reply([action("delete_habit", {}, other)]),
        );
        const key = randomUUID();
        const result = await h.api.runAssistant(
          "Create Persist first and delete an unavailable habit",
          key,
        );
        assert.equal(result.blocked, true);
        assert.match(result.reply, /1 changes were saved/);
        assert.equal(
          (
            await database.query(
              "select * from tasks where title='Persist first'",
            )
          ).rows.length,
          1,
        );
        await h.api.runAssistant(
          "Create Persist first and delete an unavailable habit",
          key,
        );
        assert.equal(
          (
            await database.query(
              "select * from tasks where title='Persist first'",
            )
          ).rows.length,
          1,
        );
        await database.query(
          "select set_config('request.jwt.claim.sub',$1,false)",
          [other],
        );
        assert.equal(
          (await database.query("select * from assistant_runs")).rows.length,
          0,
        );
        await database.query(
          "select set_config('request.jwt.claim.sub',$1,false)",
          [owner],
        );
      },
    );
  } finally {
    await database.close();
  }
});
test("Assistant proposal, shared domain execution, persistence and retries", async (t) => {
  const database = await p0Database();
  try {
    await database.query("insert into auth.users(id) values($1),($2)", [
      owner,
      other,
    ]);
    await database.query(
      "insert into user_preferences(user_id,timezone) values($1,'America/Toronto'),($2,'UTC')",
      [owner, other],
    );
    await database.query(
      "select set_config('request.jwt.claim.sub',$1,false)",
      [owner],
    );
    await database.exec("set role authenticated");
    const h = harness(database);
    let taskId, commitmentId, reminderId;
    await t.test(
      "basic task creation is proposal-first; duplicate Apply is harmless",
      async () => {
        const plan = await h.propose(
          [action("create_task", { title: "Buy groceries" })],
          "Add buy groceries to my To-Do list.",
        );
        taskId = plan.actions[0].id;
        assert.equal(
          (await database.query("select * from tasks")).rows.length,
          0,
        );
        await h.api.approveAssistantPlan(plan.planId);
        await h.api.approveAssistantPlan(plan.planId);
        assert.equal(
          (await database.query("select * from tasks")).rows.length,
          1,
        );
      },
    );
    await t.test(
      "new task preserves supplied description, due date and schedule",
      async () => {
        const plan = await h.propose([
          action("create_task", {
            title: "Study ML",
            description: "Review chapter two",
            due_at: "2099-01-10T21:00",
            scheduled_start: "2099-01-10T19:00",
            scheduled_end: "2099-01-10T20:00",
          }),
        ]);
        await h.api.approveAssistantPlan(plan.planId);
        const row = (
          await database.query("select * from tasks where id=$1", [
            plan.actions[0].id,
          ])
        ).rows[0];
        assert.equal(row.description, "Review chapter two");
        assert.equal(
          new Date(row.due_at).toISOString(),
          "2099-01-11T02:00:00.000Z",
        );
        assert.equal(
          new Date(row.scheduled_start).toISOString(),
          "2099-01-11T00:00:00.000Z",
        );
        assert.equal(
          new Date(row.scheduled_end).toISOString(),
          "2099-01-11T01:00:00.000Z",
        );
      },
    );
    await t.test(
      "date-only request proposal uses saved timezone and preserves due date",
      async () => {
        const plan = await h.propose([
          action("update_task", { due_at: "2099-01-05T23:59" }, taskId),
        ]);
        assert.equal(plan.actions[0].values.due_at, "2099-01-06T04:59:00.000Z");
        await h.api.approveAssistantPlan(plan.planId);
      },
    );
    await t.test(
      "schedule and reschedule keep the same task identity",
      async () => {
        for (const [tool, hour] of [
          ["schedule_task", "19"],
          ["reschedule_task", "20"],
        ]) {
          const plan = await h.propose([
            action(
              tool,
              {
                scheduled_start: `2099-01-05T${hour}:00`,
                scheduled_end: `2099-01-05T${hour}:30`,
              },
              taskId,
            ),
          ]);
          await h.api.approveAssistantPlan(plan.planId);
          assert.equal(plan.actions[0].id, taskId);
        }
        assert.equal(
          (await database.query("select * from commitments")).rows.length,
          0,
        );
      },
    );
    await t.test(
      "complete a task whose preserved schedule is in the past",
      async () => {
        await database.query(
          "update tasks set scheduled_start='2020-01-01T12:00Z',scheduled_end='2020-01-01T13:00Z' where id=$1",
          [taskId],
        );
        const plan = await h.propose([action("complete_task", {}, taskId)]);
        await h.api.approveAssistantPlan(plan.planId);
        assert.equal(
          (
            await database.query("select status from tasks where id=$1", [
              taskId,
            ])
          ).rows[0].status,
          "completed",
        );
      },
    );
    await t.test(
      "create then explicitly update a fixed commitment",
      async () => {
        const plan = await h.propose([
          action("create_commitment", {
            title: "Work",
            start_at: "2099-01-06T09:00",
            end_at: "2099-01-06T17:00",
          }),
        ]);
        commitmentId = plan.actions[0].id;
        await h.api.approveAssistantPlan(plan.planId);
        const update = await h.propose([
          action(
            "update_commitment",
            { start_at: "2099-01-06T10:00", end_at: "2099-01-06T18:00" },
            commitmentId,
          ),
        ]);
        assert.ok(update.actions[0].expected_updated_at);
        await h.api.approveAssistantPlan(update.planId);
        assert.equal(
          (await database.query("select * from commitments")).rows.length,
          1,
        );
      },
    );
    await t.test(
      "conflicting schedules are rejected before persistence",
      async () => {
        await assert.rejects(
          () =>
            h.propose([
              action("create_task", {
                title: "Collision",
                scheduled_start: "2099-01-06T11:00",
                scheduled_end: "2099-01-06T12:00",
              }),
            ]),
          /overlap/,
        );
      },
    );
    await t.test(
      "reminder creation and rescheduling reuse existing records",
      async () => {
        const plan = await h.propose([
          action("create_reminder", {
            title: "Study",
            scheduled_at: "2099-01-07T19:00",
            task_id: taskId,
          }),
        ]);
        reminderId = plan.actions[0].id;
        await h.api.approveAssistantPlan(plan.planId);
        const moved = await h.propose([
          action(
            "reschedule_reminder",
            { scheduled_at: "2099-01-07T20:00" },
            reminderId,
          ),
        ]);
        await h.api.approveAssistantPlan(moved.planId);
        const row = (
          await database.query("select * from reminders where id=$1", [
            reminderId,
          ])
        ).rows[0];
        assert.equal(row.task_id, taskId);
        assert.equal(
          new Date(row.scheduled_at).toISOString(),
          "2099-01-08T01:00:00.000Z",
        );
      },
    );
    await t.test(
      "failed Apply retains pending proposal; retry succeeds once",
      async () => {
        const plan = await h.propose([
          action("create_task", { title: "Retry" }),
        ]);
        h.fail(true);
        await assert.rejects(
          () => h.api.approveAssistantPlan(plan.planId),
          /could not be applied/,
        );
        assert.equal(
          (
            await database.query("select status from ai_plans where id=$1", [
              plan.planId,
            ])
          ).rows[0].status,
          "pending",
        );
        h.fail(false);
        await h.api.approveAssistantPlan(plan.planId);
        await h.api.approveAssistantPlan(plan.planId);
        assert.equal(
          (
            await database.query("select * from tasks where id=$1", [
              plan.actions[0].id,
            ])
          ).rows.length,
          1,
        );
      },
    );
    await t.test(
      "invalid payload, impossible DST and foreign IDs are rejected",
      async () => {
        for (const item of [
          action("create_task", { title: "A", user_id: other }),
          action("create_commitment", {
            title: "Bad",
            start_at: "2099-01-06T18:00",
            end_at: "2099-01-06T10:00",
          }),
          action("create_reminder", {
            title: "Bad",
            scheduled_at: "2099-03-08T02:30",
          }),
          action("update_task", { title: "Foreign" }, other),
        ])
          await assert.rejects(() => h.propose([item]));
      },
    );
    await t.test(
      "ambiguous request returns clarification without a plan",
      async () => {
        const result = await h.clarify();
        assert.equal(result.planId, null);
        assert.equal(result.actions.length, 0);
        assert.match(result.reply, /Which appointment/);
      },
    );
    await t.test(
      "database conflict rolls back every action and leaves plan pending",
      async () => {
        const plan = await h.propose([
          action("create_task", { title: "Must roll back" }),
          action("create_commitment", {
            title: "Collision",
            start_at: "2099-01-06T11:00",
            end_at: "2099-01-06T12:00",
          }),
        ]);
        await assert.rejects(() => h.api.approveAssistantPlan(plan.planId));
        assert.equal(
          (
            await database.query("select * from tasks where id=$1", [
              plan.actions[0].id,
            ])
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await database.query("select status from ai_plans where id=$1", [
              plan.planId,
            ])
          ).rows[0].status,
          "pending",
        );
      },
    );
    await t.test(
      "another account cannot apply a plan or mutate commitments",
      async () => {
        const plan = await h.propose([
          action("update_commitment", { title: "Private" }, commitmentId),
        ]);
        await database.query(
          "select set_config('request.jwt.claim.sub',$1,false)",
          [other],
        );
        await assert.rejects(
          () => h.api.approveAssistantPlan(plan.planId),
          /unavailable/,
        );
        await assert.rejects(() =>
          database.query("select apply_work_actions($1)", [
            JSON.stringify(plan.actions),
          ]),
        );
        await database.query(
          "select set_config('request.jwt.claim.sub',$1,false)",
          [owner],
        );
      },
    );
  } finally {
    await database.close();
  }
});
