import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { loadTypeScript } from "./load-typescript.mjs";
const diagnostics = loadTypeScript("lib/assistant-diagnostics.ts");
const code = ts.transpileModule(fs.readFileSync("lib/gemini.ts", "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
async function run(statuses, expire = false) {
  const logs = [],
    signals = [],
    waits = [];
  let calls = 0,
    deadlines = 0;
  const controller = new AbortController();
  const exported = { exports: {} };
  const context = {
    module: exported,
    exports: exported.exports,
    process: {
      env: { GEMINI_API_KEY: "PRIVATE_KEY", GEMINI_MODEL: "test-model" },
    },
    Math,
    AbortSignal: {
      timeout(ms) {
        assert.equal(ms, 25000);
        deadlines++;
        return controller.signal;
      },
    },
    fetch: async (url, options) => {
      signals.push(options.signal);
      const status = statuses[calls++];
      return {
        ok: status === 200,
        status,
        body: { cancel: async () => {} },
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"reply":"done"}' }] } }],
        }),
      };
    },
    require(name) {
      if (name === "server-only") return {};
      if (name === "@/lib/assistant-diagnostics") return diagnostics;
      if (name === "node:timers/promises")
        return {
          setTimeout: async (ms, value, { signal }) => {
            waits.push(ms);
            assert.equal(signal, controller.signal);
            if (expire) {
              controller.abort();
              signal.throwIfAborted();
            }
          },
        };
      throw new Error("Unexpected import");
    },
  };
  vm.runInNewContext(code, context);
  const info = console.info,
    error = console.error;
  console.info = console.error = (line) => logs.push(JSON.parse(line));
  try {
    const result = await diagnostics.diagnoseAssistant(() =>
      exported.exports.geminiJson("PRIVATE_PROMPT", {}),
    );
    assert.equal(deadlines, 1);
    assert.ok(signals.every((s) => s === controller.signal));
    assert.ok(!JSON.stringify({ logs, result }).includes("PRIVATE"));
    assert.ok(logs.every((l) => l.correlationId === logs[0].correlationId));
    return { result, logs, calls, waits };
  } finally {
    console.info = info;
    console.error = error;
  }
}
test("503 then success retries once", async () => {
  const r = await run([503, 200]);
  assert.equal(r.result.ok, true);
  assert.equal(r.calls, 2);
  assert.ok(r.waits[0] >= 500 && r.waits[0] < 650);
  assert.equal(
    r.logs.find((l) => l.event === "ASSISTANT_RETRY").geminiHttpStatus,
    503,
  );
});
test("repeated 503 stops after two retries and returns safe typed error", async () => {
  const r = await run([503, 503, 503]);
  assert.equal(r.calls, 3);
  assert.equal(r.result.ok, false);
  assert.match(r.result.error, /Reference:/);
  assert.deepEqual(
    r.logs
      .filter((l) => l.event === "ASSISTANT_RETRY")
      .map((l) => l.retryAttempt),
    [1, 2],
  );
  assert.ok(r.waits[1] >= 1000 && r.waits[1] < 1150);
  assert.equal(r.logs.at(-1).geminiHttpStatus, 503);
});
test("400 is not retried", async () => {
  const r = await run([400]);
  assert.equal(r.calls, 1);
  assert.equal(r.result.ok, false);
  assert.equal(r.waits.length, 0);
});
test("429 is retried", async () => {
  const r = await run([429, 200]);
  assert.equal(r.calls, 2);
  assert.equal(r.result.ok, true);
});
test("shared deadline aborts backoff before another attempt", async () => {
  const r = await run([503, 200], true);
  assert.equal(r.calls, 1);
  assert.equal(r.result.ok, false);
});
test("auth/model failures are not retried", async () => {
  for (const status of [401, 403, 404]) {
    const r = await run([status]);
    assert.equal(r.calls, 1);
    assert.equal(r.result.ok, false);
  }
});
