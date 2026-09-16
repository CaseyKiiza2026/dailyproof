import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { p0Database } from "./p0-database.mjs";
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const migration =
  "supabase/migrations/20260915100000_enqueue_due_notifications.sql";
test("enqueue additive repair succeeds twice without duplicate notifications and preserves behavior", async () => {
  const db = await p0Database();
  try {
    await db.query("insert into auth.users(id) values($1),($2)", [
      owner,
      other,
    ]);
    await db.query(
      "insert into user_preferences(user_id,timezone) values($1,'America/Toronto'),($2,'UTC')",
      [owner, other],
    );
    // Reproduce the ambiguous alias failure from the historical implementation.
    const original = fs.readFileSync(
      "supabase/migrations/20260914130000_notifications.sql",
      "utf8",
    );
    const old = original
      .slice(
        original.indexOf("create function public.enqueue_due_notifications"),
        original.indexOf("create function public.claim_push_notifications"),
      )
      .replace("create function", "create or replace function");
    await db.exec(old);
    await assert.rejects(
      () => db.query("select public.enqueue_due_notifications()"),
      /ambiguous|not assigned/,
    );
    const aclBefore = (
      await db.query(
        "select proacl::text,prosecdef,proconfig from pg_proc where oid='public.enqueue_due_notifications()'::regprocedure",
      )
    ).rows;
    await db.exec(fs.readFileSync(migration, "utf8"));
    assert.deepEqual(
      (
        await db.query(
          "select proacl::text,prosecdef,proconfig from pg_proc where oid='public.enqueue_due_notifications()'::regprocedure",
        )
      ).rows,
      aclBefore,
    );
    await db.query(
      "insert into notification_settings(user_id,enabled,daily_time) values($1,true,'00:00'),($2,false,'00:00')",
      [owner, other],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    const due = (
      await db.query(
        "insert into tasks(user_id,title,due_at) values($1,'Due soon',now()+interval '10 minutes') returning id",
        [owner],
      )
    ).rows[0].id;
    await db.query(
      "insert into tasks(user_id,title,due_at) values($1,'Disabled due soon',now()+interval '10 minutes')",
      [other],
    );
    const completed = (
      await db.query(
        "insert into tasks(user_id,title,status) values($1,'Complete','completed') returning id",
        [owner],
      )
    ).rows[0].id;
    const habit = (
      await db.query(
        "insert into habits(user_id,name,category) values($1,'Habit','Discipline') returning id",
        [owner],
      )
    ).rows[0].id;
    await db.query(
      "insert into habit_logs(user_id,habit_id,log_date,status) values($1,$2,(now() at time zone 'America/Toronto')::date,'complete')",
      [owner, habit],
    );
    const reminder = async (
      title,
      taskId = null,
      habitId = null,
      conditional = false,
    ) => {
      const id = (
        await db.query(
          "insert into reminders(user_id,title,message,scheduled_at,task_id,habit_id,only_if_incomplete) values($1,$2,'Original message',now()+interval '1 hour',$3,$4,$5) returning id",
          [owner, title, taskId, habitId, conditional],
        )
      ).rows[0].id;
      // Existing update path allows due records without disabling any triggers.
      await db.query("update reminders set scheduled_at=now() where id=$1", [
        id,
      ]);
      return id;
    };
    const normal = await reminder("Normal"),
      skippedTask = await reminder("Skip task", completed, null, true),
      skippedHabit = await reminder("Skip habit", null, habit, true);
    const future = (
      await db.query(
        "insert into reminders(user_id,title,scheduled_at) values($1,'Future',now()+interval '1 hour') returning id",
        [owner],
      )
    ).rows[0].id;
    await db.exec("set role service_role");
    await db.query("select public.enqueue_due_notifications()");
    const first = (
      await db.query(
        "select id,type,source_key,title,body from notifications order by source_key",
      )
    ).rows;
    assert.equal(first.length, 3);
    assert.deepEqual(
      new Set(first.map((n) => n.type)),
      new Set(["scheduled_reminder", "dailyproof_reminder", "task_due_soon"]),
    );
    assert.equal(
      first.find((n) => n.type === "scheduled_reminder").body,
      "Original message",
    );
    assert.ok(first.some((n) => n.source_key === `reminder:${normal}`));
    assert.ok(first.some((n) => n.source_key.startsWith(`task:${due}:`)));
    assert.equal(
      first.find((n) => n.type === "dailyproof_reminder").source_key,
      (
        await db.query(
          "select 'daily:'||$1::text||':'||(now() at time zone 'America/Toronto')::date as key",
          [owner],
        )
      ).rows[0].key,
    );
    await db.query("select public.enqueue_due_notifications()");
    assert.deepEqual(
      (
        await db.query(
          "select id,type,source_key,title,body from notifications order by source_key",
        )
      ).rows,
      first,
    );
    const states = (await db.query("select id,status from reminders")).rows;
    assert.equal(states.find((r) => r.id === normal).status, "queued");
    assert.equal(states.find((r) => r.id === skippedTask).status, "skipped");
    assert.equal(states.find((r) => r.id === skippedHabit).status, "skipped");
    assert.equal(states.find((r) => r.id === future).status, "pending");
    for (const role of ["authenticated", "anon"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        () => db.query("select public.enqueue_due_notifications()"),
        /permission denied/,
      );
    }
  } finally {
    await db.close();
  }
});
