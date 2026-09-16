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

// Virtual time exercises the actual production deadline/abort logic without
// waiting 25 seconds or making requests with real credentials.
async function run(
  steps,
  { fallback = "backup-model", image, schema = {}, standalone = false } = {},
) {
  const logs = [],
    calls = [],
    waits = [],
    deadlines = [];
  let elapsed = 0;
  function timeout(ms) {
    const controller = new AbortController();
    deadlines.push({ at: elapsed + ms, controller, ms });
    return controller.signal;
  }
  function advance(ms, signal) {
    signal.throwIfAborted();
    const end = elapsed + ms;
    for (const deadline of [...deadlines].sort((a, b) => a.at - b.at)) {
      if (!deadline.controller.signal.aborted && deadline.at <= end) {
        elapsed = deadline.at;
        deadline.controller.abort(
          new DOMException("private timeout detail", "TimeoutError"),
        );
        signal.throwIfAborted();
      }
    }
    elapsed = end;
  }
  const exported = { exports: {} };
  vm.runInNewContext(code, {
    module: exported,
    exports: exported.exports,
    Error,
    process: {
      env: {
        GEMINI_API_KEY: "PRIVATE_KEY",
        GEMINI_MODEL: "primary-model",
        GEMINI_FALLBACK_MODEL: fallback,
      },
    },
    Math: { random: () => 0.5, floor: Math.floor },
    AbortSignal: { timeout, any: (signals) => AbortSignal.any(signals) },
    fetch: async (url, options) => {
      const step = steps[calls.length];
      assert.ok(step !== undefined, "unexpected extra request");
      calls.push({ url, body: options.body });
      const item = typeof step === "number" ? { status: step } : step;
      advance(item.ms ?? 0, options.signal);
      if (item.error) throw item.error;
      return {
        ok: item.status === 200,
        status: item.status,
        body: { cancel: async () => {} },
        text: async () => {
          assert.equal(
            item.status,
            200,
            "error response bodies must not be read",
          );
          advance(item.bodyMs ?? 0, options.signal);
          if (item.bodyError) throw item.bodyError;
          return (
            item.body ??
            JSON.stringify({
              candidates: [
                { content: { parts: [{ text: '{"reply":"done"}' }] } },
              ],
            })
          );
        },
      };
    },
    require(name) {
      if (name === "server-only") return {};
      if (name === "@/lib/assistant-diagnostics") return diagnostics;
      if (name === "node:timers/promises")
        return {
          setTimeout: async (ms, value, { signal }) => {
            waits.push(ms);
            advance(ms, signal);
          },
        };
      throw new Error("Unexpected import");
    },
  });
  const originalInfo = console.info,
    originalError = console.error;
  console.info = console.error = (entry) => logs.push(JSON.parse(entry));
  try {
    const request = () =>
      exported.exports.geminiJson("PRIVATE_PROMPT", schema, image);
    const result = standalone
      ? await request()
      : await diagnostics.diagnoseAssistant(request);
    assert.ok(!JSON.stringify({ logs, result }).includes("PRIVATE"));
    assert.ok(!JSON.stringify(logs).includes("private timeout detail"));
    assert.ok(logs.every((l) => l.correlationId === logs[0].correlationId));
    assert.match(logs[0].correlationId, /^[0-9a-f-]{36}$/);
    assert.equal(deadlines.filter((d) => d.ms === 25000).length, 1);
    assert.ok(elapsed <= 25000);
    return { result, calls, logs, waits, elapsed, deadlines };
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }
}
const attempts = (r) => r.logs.filter((l) => l.event === "GEMINI_ATTEMPT");
const switches = (r) => r.logs.filter((l) => l.event === "GEMINI_FALLBACK");

test("primary succeeds without fallback", async () => {
  const r = await run([200]);
  assert.equal(r.result.ok, true);
  assert.equal(r.result.reply, "done");
  assert.equal(r.calls.length, 1);
  assert.equal(switches(r).length, 0);
  assert.equal(attempts(r)[0].model, "primary-model");
  assert.equal(attempts(r)[0].attempt, 1);
  assert.equal(attempts(r)[0].geminiHttpStatus, 200);
  assert.equal(attempts(r)[0].fallbackActivated, false);
});

test("primary 503 then success retries without switching models", async () => {
  const r = await run([503, 200]);
  assert.equal(r.result.ok, true);
  assert.deepEqual(
    attempts(r).map((l) => [l.role, l.attempt, l.geminiHttpStatus]),
    [
      ["primary", 1, 503],
      ["primary", 2, 200],
    ],
  );
  assert.equal(switches(r).length, 0);
  assert.ok(r.waits[0] >= 500 && r.waits[0] < 650);
  const retry = r.logs.find((l) => l.event === "ASSISTANT_RETRY");
  assert.equal(retry.attempt, 2);
  assert.equal(retry.geminiHttpStatus, 503);
});

test("primary exhausts transient retries and fallback succeeds with identical JSON/image payload", async () => {
  const r = await run([503, 503, 503, 200], {
    image: { mimeType: "image/png", data: "PRIVATE_IMAGE" },
    schema: { type: "object" },
  });
  assert.equal(r.result.ok, true);
  assert.equal(r.calls.length, 4);
  assert.equal(switches(r).length, 1);
  assert.equal(attempts(r).at(-1).role, "fallback");
  assert.equal(attempts(r).at(-1).model, "backup-model");
  assert.equal(attempts(r).at(-1).attempt, 1);
  assert.equal(attempts(r).at(-1).fallbackActivated, true);
  assert.ok(r.calls.every((c) => c.body === r.calls[0].body));
  const payload = JSON.parse(r.calls[3].body);
  assert.equal(payload.contents[0].parts[1].inlineData.data, "PRIVATE_IMAGE");
  assert.equal(payload.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(payload.generationConfig.responseJsonSchema, {
    type: "object",
  });
  assert.ok(r.calls[3].url.endsWith("/backup-model:generateContent"));
  assert.ok(r.waits[1] >= 1000 && r.waits[1] < 1150);
});

test("primary provider timeout leaves time for successful fallback", async () => {
  const r = await run([{ status: 200, ms: 20000 }, 200]);
  assert.equal(r.result.ok, true);
  assert.equal(r.calls.length, 2);
  assert.equal(r.elapsed, 12500);
  assert.equal(attempts(r)[0].errorName, "TimeoutError");
  assert.equal(attempts(r)[0].geminiHttpStatus, null);
  assert.equal(switches(r).length, 1);
});

test("timeout during primary response transfer also activates fallback", async () => {
  const r = await run([{ status: 200, bodyMs: 20000 }, 200]);
  assert.equal(r.result.ok, true);
  assert.equal(r.elapsed, 12500);
  assert.equal(r.calls.length, 2);
});

test("both models exhaust retries and return the existing safe typed error", async () => {
  const r = await run([503, 503, 503, 503, 503, 503]);
  assert.equal(r.result.ok, false);
  assert.match(r.result.error, /Reference:/);
  assert.equal(r.calls.length, 6);
  assert.deepEqual(
    attempts(r).map((l) => l.attempt),
    [1, 2, 3, 1, 2, 3],
  );
  assert.equal(r.logs.at(-1).event, "ASSISTANT_ERROR");
  assert.equal(r.logs.at(-1).geminiHttpStatus, 503);
});

test("400 and auth/model 4xx errors never retry or activate fallback", async () => {
  for (const status of [400, 401, 403, 404, 422]) {
    const r = await run([status]);
    assert.equal(r.result.ok, false);
    assert.equal(r.calls.length, 1);
    assert.equal(switches(r).length, 0);
  }
});

test("all allowed transient HTTP statuses can activate fallback", async () => {
  for (const status of [429, 500, 502, 503, 504]) {
    const r = await run([status, status, status, 200]);
    assert.equal(r.result.ok, true);
    assert.equal(r.calls.length, 4);
  }
});

test("fallback has its own bounded retries", async () => {
  const r = await run([503, 503, 503, 429, 200]);
  assert.equal(r.result.ok, true);
  assert.deepEqual(
    attempts(r)
      .slice(-2)
      .map((l) => [l.role, l.attempt]),
    [
      ["fallback", 1],
      ["fallback", 2],
    ],
  );
});

test("total latency remains 25 seconds across slow primary and fallback", async () => {
  const r = await run([
    { status: 200, ms: 30000 },
    { status: 200, ms: 30000 },
  ]);
  assert.equal(r.result.ok, false);
  assert.equal(r.calls.length, 2);
  assert.equal(r.elapsed, 25000);
  assert.equal(r.logs.at(-1).errorName, "TimeoutError");
});

test("deadline includes retry backoff and fallback body transfer", async () => {
  const r = await run([
    { status: 503, ms: 12400 },
    { status: 200, bodyMs: 20000 },
  ]);
  assert.equal(r.result.ok, false);
  assert.equal(r.calls.length, 2);
  assert.equal(r.elapsed, 25000);
});

test("missing or identical fallback preserves primary-only retries and deadline", async () => {
  for (const fallback of [undefined, "", "primary-model"]) {
    // Empty string also represents an unset optional environment value.
    const r = await run([503, 503, 503], { fallback: fallback ?? "" });
    assert.equal(r.result.ok, false);
    assert.equal(r.calls.length, 3);
    assert.equal(r.deadlines.length, 1);
    assert.equal(switches(r).length, 0);
  }
});

test("malformed provider JSON or structured content does not activate fallback", async () => {
  for (const body of [
    "private malformed body",
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: "not JSON" }] } }],
    }),
  ]) {
    const r = await run([{ status: 200, body }]);
    assert.equal(r.result.ok, false);
    assert.equal(r.calls.length, 1);
    assert.equal(switches(r).length, 0);
    assert.equal(r.logs.at(-1).stage, "gemini_response_parsing");
  }
});

test("non-timeout network errors are not blindly retried on another model", async () => {
  const r = await run([{ error: new TypeError("PRIVATE_NETWORK_DETAIL") }]);
  assert.equal(r.result.ok, false);
  assert.equal(r.calls.length, 1);
  assert.equal(switches(r).length, 0);
});

test("standalone Gemini calls also have a correlation ID", async () => {
  const r = await run([200], { standalone: true });
  assert.equal(r.result.reply, "done");
  assert.equal(attempts(r).length, 1);
});

test("fallback normal 4xx stops immediately", async () => {
  const r = await run([503, 503, 503, 400]);
  assert.equal(r.result.ok, false);
  assert.equal(r.calls.length, 4);
  assert.equal(r.logs.at(-1).geminiHttpStatus, 400);
});

test("non-timeout body transfer failure is logged as failure without fallback", async () => {
  const r = await run([
    { status: 200, bodyError: new TypeError("PRIVATE_BODY_ERROR") },
  ]);
  assert.equal(r.result.ok, false);
  assert.equal(r.calls.length, 1);
  assert.equal(attempts(r)[0].status, "failure");
  assert.equal(switches(r).length, 0);
});
