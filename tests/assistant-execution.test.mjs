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
function harness(database) {
  const models = [],
    prompts = [],
    modules = new Map();
  let failApply = false;
  const db = {
    rpc: async (name, args) => {
      if (name === "apply_ai_plan" && failApply)
        return { error: { code: "08006" }, data: null };
      try {
        const values =
          name === "apply_ai_plan"
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
        return { data: null, error };
      }
    },
    from(table) {
      let columns = "*",
        insert,
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
              } else {
                params = filters.map((f) => f[1]);
                query = `select ${columns} from ${table}${filters.length ? " where " + filters.map(([key], i) => `${key}=$${i + 1}`).join(" and ") : ""}`;
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
        assert.ok(models.length, "Unexpected provider call");
        return models.shift();
      },
    },
    "@/lib/ai-tools": {
      readAiTool: async () => ({ incompleteTasks: [], incompleteHabits: [] }),
      verifyOwnedProof: async () => ({ verification: "likely" }),
    },
    "@/lib/assistant-diagnostics": {
      assistantStage: async (_s, _f, run) => run(),
      diagnoseAssistant: async (run) => ({ ok: true, ...(await run()) }),
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
    prompts,
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
    await t.test("new task preserves supplied description, due date and schedule", async () => {
      const plan = await h.propose([action("create_task", {
        title: "Study ML", description: "Review chapter two", due_at: "2099-01-10T21:00",
        scheduled_start: "2099-01-10T19:00", scheduled_end: "2099-01-10T20:00",
      })]);
      await h.api.approveAssistantPlan(plan.planId);
      const row = (await database.query("select * from tasks where id=$1", [plan.actions[0].id])).rows[0];
      assert.equal(row.description, "Review chapter two");
      assert.equal(new Date(row.due_at).toISOString(), "2099-01-11T02:00:00.000Z");
      assert.equal(new Date(row.scheduled_start).toISOString(), "2099-01-11T00:00:00.000Z");
      assert.equal(new Date(row.scheduled_end).toISOString(), "2099-01-11T01:00:00.000Z");
    });
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
