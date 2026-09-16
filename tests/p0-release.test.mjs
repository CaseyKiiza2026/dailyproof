import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { timingSafeEqual } from "node:crypto";
import { loadTypeScript } from "./load-typescript.mjs";

const { navigateCalendarEvent } = loadTypeScript("lib/calendar-navigation.ts");
test("VS-08: only unmodified internal calendar links use client navigation", () => {
  for (const url of ["/todos", "/dashboard"]) {
    let prevented = false;
    const routes = [];
    navigateCalendarEvent(
      url,
      {
        button: 0,
        preventDefault() {
          prevented = true;
        },
      },
      (path) => routes.push(path),
    );
    assert.equal(prevented, true);
    assert.deepEqual(routes, [url]);
    for (const change of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
      { button: 2 },
      { defaultPrevented: true },
      { currentTarget: { closest: () => ({ target: "_blank" }) } },
    ]) {
      navigateCalendarEvent(
        url,
        {
          button: 0,
          ...change,
          preventDefault() {
            assert.fail("Native click intercepted");
          },
        },
        () => assert.fail("Unexpected navigation"),
      );
    }
  }
  for (const url of [
    "",
    "/untrusted",
    "https://example.com",
    "javascript:alert(1)",
  ]) {
    navigateCalendarEvent(
      url,
      {
        button: 0,
        preventDefault() {
          assert.fail("Non-task/habit event intercepted");
        },
      },
      () => assert.fail("Unexpected navigation"),
    );
  }
});

function load(file, dependencies, globals = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInNewContext(code, {
    module: loaded,
    exports: loaded.exports,
    require: (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`);
      return dependencies[name];
    },
    Response,
    Buffer,
    AbortSignal,
    ...globals,
  });
  return loaded.exports;
}

test("R-05: cron rejects absent/wrong/unconfigured bearer secrets before invoking the worker", async () => {
  for (const [secret, authorization] of [
    [undefined, "Bearer undefined"],
    ["test-secret", null],
    ["test-secret", "Bearer wrong"],
    ["test-secret", "Bearer test-secrex"],
  ]) {
    const route = load(
      "app/api/cron/reminders/route.ts",
      {
        "node:crypto": { timingSafeEqual },
        "@/lib/push": {
          deliverNotifications: () =>
            assert.fail("Unauthorized worker invocation"),
        },
      },
      { process: { env: { CRON_SECRET: secret } } },
    );
    const response = await route.GET(
      new Request("https://example.test/api/cron/reminders", {
        headers: authorization ? { authorization } : {},
      }),
    );
    assert.equal(response.status, 401);
  }
});

test("R-05: authenticated cron invokes worker and reports failures safely", async () => {
  let fail = false,
    count = 0;
  const route = load(
    "app/api/cron/reminders/route.ts",
    {
      "node:crypto": { timingSafeEqual },
      "@/lib/push": {
        deliverNotifications: async () => {
          count++;
          if (fail) throw new Error("private provider detail");
          return { processed: 2 };
        },
      },
    },
    { process: { env: { CRON_SECRET: "test-secret" } } },
  );
  const request = () =>
    new Request("https://example.test/api/cron/reminders", {
      headers: { authorization: "Bearer test-secret" },
    });
  assert.deepEqual(await (await route.GET(request())).json(), { processed: 2 });
  fail = true;
  const response = await route.GET(request());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private provider/);
  assert.equal(count, 2);
});

test("R-05: failed delivery is retained for retry with a stable idempotency key and generic push body", async () => {
  const finishes = [],
    payloads = [];
  let attempt = 1;
  const db = {
    rpc: async (name, args) => {
      if (name === "enqueue_due_notifications") return { error: null };
      if (name === "claim_push_notifications")
        return {
          data: [
            {
              id: "notification-id",
              user_id: "user-id",
              type: "scheduled_reminder",
              title: "DailyProof",
              body: null,
              attempts: attempt,
            },
          ],
          error: null,
        };
      finishes.push(args);
      return { error: null };
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: {
            enabled: true,
            push_alias: "opaque-alias",
            nudges: true,
            friend_activity: true,
          },
          error: null,
        }),
      };
      return query;
    },
  };
  const worker = load(
    "lib/push.ts",
    {
      "server-only": {},
      "@/lib/supabase/admin": { createAdminClient: () => db },
    },
    {
      process: {
        env: {
          ONESIGNAL_APP_ID: "synthetic-app",
          ONESIGNAL_REST_API_KEY: "synthetic-key",
          APP_URL: "https://example.test",
        },
      },
      fetch: async (_url, options) => {
        payloads.push(JSON.parse(options.body));
        return Response.json(
          attempt === 1
            ? { error: "private provider detail" }
            : { id: "delivery" },
          { status: attempt === 1 ? 503 : 200 },
        );
      },
    },
  );
  await worker.deliverNotifications();
  attempt++;
  await worker.deliverNotifications();
  assert.equal(finishes[0].p_status, "failed");
  assert.equal(finishes[1].p_status, "sent");
  assert.equal(finishes[1].p_attempt, 2);
  assert.doesNotMatch(finishes[0].p_error, /private provider/);
  assert.equal(payloads[0].idempotency_key, payloads[1].idempotency_key);
  assert.equal(payloads[0].contents.en, "You have a DailyProof notification.");
});

for (const [label, row, heading, content] of [
  [
    "scheduled reminder title and body are preserved",
    { title: "Study ML at 7 PM", body: "  Review chapter 3.  " },
    "Study ML at 7 PM",
    "  Review chapter 3.  ",
  ],
  [
    "null body falls back",
    { body: null },
    "Study ML",
    "You have a DailyProof notification.",
  ],
  [
    "empty body falls back",
    { body: "" },
    "Study ML",
    "You have a DailyProof notification.",
  ],
  [
    "whitespace body falls back",
    { body: " \n " },
    "Study ML",
    "You have a DailyProof notification.",
  ],
  [
    "nudge retains intended message",
    { type: "nudge", title: "DailyProof", body: "Different database message" },
    "DailyProof",
    "A friend sent you a nudge.",
  ],
  [
    "blank title and body retain generic fallback",
    { title: " ", body: "" },
    "DailyProof",
    "You have a DailyProof notification.",
  ],
  [
    "missing content safely falls back",
    { title: undefined, body: undefined },
    "DailyProof",
    "You have a DailyProof notification.",
  ],
]) {
  test(`R-05: push ${label}`, async () => {
    const payloads = [];
    const db = {
      async rpc(name, args) {
        if (name === "enqueue_due_notifications") return { error: null };
        if (name === "claim_push_notifications")
          return {
            data: [
              {
                id: "notification-id",
                user_id: "user-id",
                type: "scheduled_reminder",
                title: "Study ML",
                body: "Review chapter 3.",
                attempts: 1,
                ...row,
              },
            ],
            error: null,
          };
        assert.equal(name, "finish_push_notification");
        assert.equal(args.p_status, "sent");
        return { error: null };
      },
      from() {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({
            data: {
              enabled: true,
              push_alias: "opaque-alias",
              nudges: true,
              friend_activity: true,
            },
            error: null,
          }),
        };
        return query;
      },
    };
    const worker = load(
      "lib/push.ts",
      {
        "server-only": {},
        "@/lib/supabase/admin": { createAdminClient: () => db },
      },
      {
        process: {
          env: {
            ONESIGNAL_APP_ID: "synthetic-app",
            ONESIGNAL_REST_API_KEY: "synthetic-key",
            APP_URL: "https://example.test",
          },
        },
        fetch: async (_url, options) => {
          payloads.push(JSON.parse(options.body));
          return Response.json({ id: "delivery" });
        },
      },
    );
    await worker.deliverNotifications();
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].headings.en, heading);
    assert.equal(payloads[0].contents.en, content);
  });
}
