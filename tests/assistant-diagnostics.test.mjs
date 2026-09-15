import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";
const { diagnoseAssistant, assistantStage } = loadTypeScript(
  "lib/assistant-diagnostics.ts",
);

test("assistant diagnostics redact private error fields and preserve safe database codes", async () => {
  const logs = [];
  const original = console.error;
  console.error = (entry) => logs.push(JSON.parse(entry));
  try {
    const result = await diagnoseAssistant(() =>
      assistantStage("quota", "consume_ai_request", () => {
        throw Object.assign(new Error("PRIVATE_PROMPT_AND_KEY"), {
          name: "PRIVATE_NAME",
          cause: { code: "42501", details: "PRIVATE_TASK" },
        });
      }),
    );
    assert.equal(result.ok, false);
    assert.match(result.correlationId, /^[0-9a-f-]{36}$/);
    assert.ok(result.error.endsWith(result.correlationId));
    assert.equal(logs.at(-1).event, "ASSISTANT_ERROR");
    assert.equal(logs.at(-1).stage, "quota");
    assert.equal(logs.at(-1).safeCode, "42501");
    assert.equal(logs.at(-1).errorName, "Error");
    assert.ok(logs.every((l) => l.correlationId === result.correlationId));
    assert.ok(!JSON.stringify({ logs, result }).includes("PRIVATE"));
  } finally {
    console.error = original;
  }
});

test("nested failures preserve Gemini stage/status and concurrent requests have separate references", async () => {
  const logs = [];
  const original = console.error;
  console.error = (entry) => logs.push(JSON.parse(entry));
  try {
    const results = await Promise.all(
      [1, 2].map(() =>
        diagnoseAssistant(() =>
          assistantStage("read_tool", "readAiTool", () =>
            assistantStage("gemini_request", "geminiJson", async () => {
              await Promise.resolve();
              throw Object.assign(new Error("private provider body"), {
                geminiHttpStatus: 400,
                code: "private-key",
              });
            }),
          ),
        ),
      ),
    );
    assert.notEqual(results[0].correlationId, results[1].correlationId);
    const failures = logs.filter((l) => l.event === "ASSISTANT_ERROR");
    assert.equal(failures.length, 2);
    for (const log of failures) {
      assert.equal(log.stage, "gemini_request");
      assert.equal(log.geminiHttpStatus, 400);
      assert.equal(log.safeCode, "UNCLASSIFIED");
    }
    assert.ok(!JSON.stringify(logs).includes("private"));
  } finally {
    console.error = original;
  }
});

test("success preserves the reply without logging response contents", async () => {
  const logs = [];
  const original = console.info;
  console.info = (entry) => logs.push(JSON.parse(entry));
  try {
    const reply = { reply: "private reply", actions: [], planId: null };
    const result = await diagnoseAssistant(() =>
      assistantStage("getTasks", "getTasks", async () => reply),
    );
    assert.deepEqual(result, { ...reply, ok: true });
    assert.deepEqual(
      logs.map((l) => l.stage),
      ["getTasks", "final_return"],
    );
    assert.ok(!JSON.stringify(logs).includes("private"));
  } finally {
    console.info = original;
  }
});
