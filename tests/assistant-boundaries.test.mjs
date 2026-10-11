import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";
import { p0Database } from "./p0-database.mjs";
import { loadTypeScript } from "./load-typescript.mjs";
const {
  assistantData,
  assistantConversation,
  parseAssistantArguments,
  assistantWrites,
  resolveAssistantDates,
} = loadTypeScript("lib/assistant-tools.ts");
test("Provider data omits identity/Storage/push details; tools cannot change ownership or privacy", () => {
  assert.deepEqual(
    assistantData({
      user_id: "secret-account",
      push_alias: "secret-push",
      storage_path: "secret-file",
      tasks: [{ id: "task", title: "Own task", user_id: "secret-account" }],
    }),
    { tasks: [{ id: "task", title: "Own task" }] },
  );
  for (const action of [
    {
      tool: "create_habit",
      id: randomUUID(),
      arguments: { name: "Forged identity" },
    },
    {
      tool: "create_habit",
      arguments: { name: "Injection", user_id: randomUUID() },
    },
    {
      tool: "update_notification_settings",
      arguments: { push_alias: "steal" },
    },
    {
      tool: "add_proof",
      arguments: { type: "note", content: "hi", visibility: "friends" },
    },
    { tool: "sql", arguments: { query: "select * from auth.users" } },
    { tool: "set_proof_sharing", arguments: { enabled: true } },
    {
      tool: "create_habit",
      arguments: { name: "Invalid days", scheduled_days: [0, 8] },
    },
  ])
    assert.throws(() => parseAssistantArguments(action, assistantWrites));
  assert.equal(
    assistantConversation(
      Array.from({ length: 20 }, (_, i) => ({
        question: String(i),
        reply: "reply",
      })),
    ).length,
    8,
  );
  assert.equal(
    resolveAssistantDates(
      { scheduled_at: "2099-01-05T19:30:00", due_at: "2099-01-05" },
      "America/Toronto",
    ).scheduled_at,
    "2099-01-06T00:30:00.000Z",
  );
  assert.throws(() =>
    resolveAssistantDates(
      { scheduled_at: "2099-03-08T02:30:00" },
      "America/Toronto",
    ),
  );
});
function cleanupModule() {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync("lib/proof-cleanup.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}})`)(
    () => ({}),
    loadedModule,
    loadedModule.exports,
  );
  return loadedModule.exports;
}
test("Image deletion and cascade cleanup preserve RLS and retry Storage failures", async () => {
  const db = await p0Database();
  const owner = randomUUID(),
    other = randomUUID(),
    task = randomUUID(),
    proof = randomUUID();
  try {
    await db.query("insert into auth.users(id) values($1),($2)", [
      owner,
      other,
    ]);
    await db.query(
      "insert into user_preferences(user_id,timezone) values($1,'UTC'),($2,'UTC')",
      [owner, other],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    await db.exec("set role authenticated");
    await db.query(
      "insert into tasks(id,user_id,title,status) values($1,$2,'Proof task','completed')",
      [task, owner],
    );
    const path = `${owner}/${proof}`;
    await db.query(
      "insert into proofs(id,user_id,task_id,type,storage_path) values($1,$2,$3,'image',$4)",
      [proof, owner, task, path],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values('proofs',$1)",
      [path],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    await assert.rejects(() =>
      db.query("select apply_work_actions($1)", [
        JSON.stringify([{ tool: "delete_proof", id: proof, values: {} }]),
      ]),
    );
    await assert.rejects(() =>
      db.query(
        "insert into proof_file_cleanup(proof_id,user_id,storage_path) values($1,$2,$3)",
        [proof, owner, path],
      ),
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    await db.query("select apply_work_actions($1)", [
      JSON.stringify([{ tool: "delete_proof", id: proof, values: {} }]),
    ]);
    assert.equal((await db.query("select * from proofs")).rows.length, 0);
    assert.equal(
      (await db.query("select * from proof_file_cleanup")).rows.length,
      1,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    assert.equal(
      (await db.query("select * from proof_file_cleanup")).rows.length,
      0,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    let fail = true;
    const transport = {
      from() {
        let deleting = false,
          id;
        const chain = {
          select() {
            return chain;
          },
          order() {
            return chain;
          },
          limit() {
            return chain;
          },
          delete() {
            deleting = true;
            return chain;
          },
          eq(_key, value) {
            id = value;
            return chain;
          },
          async then(resolve) {
            try {
              const result = deleting
                ? await db.query(
                    "delete from proof_file_cleanup where proof_id=$1 returning proof_id",
                    [id],
                  )
                : await db.query(
                    "select proof_id,storage_path from proof_file_cleanup",
                  );
              resolve({ data: result.rows, error: null });
            } catch (error) {
              resolve({ data: null, error });
            }
          },
        };
        return chain;
      },
      storage: {
        from() {
          return {
            async remove(paths) {
              if (fail) return { error: new Error("Synthetic Storage outage") };
              for (const file of paths)
                await db.query(
                  "delete from storage.objects where bucket_id='proofs' and name=$1",
                  [file],
                );
              return { error: null };
            },
          };
        },
      },
    };
    const { cleanupProofFiles } = cleanupModule();
    assert.equal((await cleanupProofFiles(transport)).pending, true);
    assert.equal(
      (await db.query("select * from proof_file_cleanup")).rows.length,
      1,
    );
    fail = false;
    assert.equal((await cleanupProofFiles(transport)).removed, 1);
    assert.equal(
      (await db.query("select * from proof_file_cleanup")).rows.length,
      0,
    );
    assert.equal((await cleanupProofFiles(transport)).removed, 0);
    const second = randomUUID();
    await db.query(
      "insert into proofs(id,user_id,task_id,type,storage_path) values($1,$2,$3,'image',$4)",
      [second, owner, task, `${owner}/${second}`],
    );
    await db.query("select apply_work_actions($1)", [
      JSON.stringify([{ tool: "delete_task", id: task, values: {} }]),
    ]);
    assert.equal(
      (await db.query("select * from proof_file_cleanup")).rows.length,
      1,
      "cascade deletion also queues the file",
    );
  } finally {
    await db.close();
  }
});
