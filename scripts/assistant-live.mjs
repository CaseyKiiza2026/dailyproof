// Opt-in integration check: only Gemini is remote. All application data and
// operations run in isolated PGlite; Supabase production is never contacted.
import { spawn } from "node:child_process";
import fs from "node:fs";
const quotaMarker = "out/assistant-live-quota-blocked.json";
if (
  fs.existsSync(quotaMarker) &&
  !process.argv.includes("--retry-after-quota")
) {
  console.error(
    "BLOCKED: previous live Gemini check exhausted quota. No requests sent. After quota is available, explicitly use --retry-after-quota.",
  );
  process.exit(2);
}
if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL) {
  console.error(
    "Configure GEMINI_API_KEY and GEMINI_MODEL for this opt-in test.",
  );
  process.exit(1);
}
if (process.argv.includes("--fallback-only")) {
  if (!process.env.GEMINI_FALLBACK_MODEL) {
    console.error(
      "A configured fallback model is required for --fallback-only.",
    );
    process.exit(1);
  }
  process.env.GEMINI_MODEL = process.env.GEMINI_FALLBACK_MODEL;
  process.env.GEMINI_FALLBACK_MODEL = "";
}
const child = spawn(
  process.execPath,
  [
    "--test",
    "--test-name-pattern=Live Gemini",
    "tests/assistant-execution.test.mjs",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DAILYPROOF_ASSISTANT_LIVE: "1",
      DAILYPROOF_LIVE_PACING_MS: "15000",
    },
  },
);
child.on("error", () => {
  console.error("Unable to start the local integration check.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
