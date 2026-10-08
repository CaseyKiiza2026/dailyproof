import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";
const { diagnoseAssistant, assistantStage } = loadTypeScript(
  "lib/assistant-diagnostics.ts",
);
test("provider quota errors stay explicit, private, and retryable", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const result = await diagnoseAssistant(() =>
      assistantStage("gemini_request", "geminiJson", () => {
        throw Object.assign(new Error("PRIVATE provider response"), {
          geminiHttpStatus: 429,
        });
      }),
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /rate-limited.*retry/);
    assert.doesNotMatch(result.error, /PRIVATE|unsupported|cannot perform/);
  } finally {
    console.error = original;
  }
});
