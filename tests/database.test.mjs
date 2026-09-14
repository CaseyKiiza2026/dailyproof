import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { loadTypeScript } from "./load-typescript.mjs";

const db = new PGlite();
const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const C = "00000000-0000-4000-8000-000000000003";
const H = "10000000-0000-4000-8000-000000000001";
const HB = "10000000-0000-4000-8000-000000000002";
const stats = loadTypeScript("lib/stats.ts");
const { calendarDays, shiftDateKey } = loadTypeScript("lib/timezone.ts");
let monday;
let wednesday;

async function scalar(sql, args = []) {
  const { rows } = await db.query(sql, args);
  return Object.values(rows[0])[0];
}
async function asUser(id, fn, role = "authenticated") {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]);
  try { return await fn(); }
  finally { await db.exec("reset role; reset request.jwt.claim.sub"); }
}
const denied = (operation) => assert.rejects(operation, (error) => error.code === "42501");

before(async () => {
  await db.exec(fs.readFileSync("tests/fixtures/base-schema.sql", "utf8"));
  const migrations = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  for (const file of migrations.filter((f) => !f.startsWith("20260914"))) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  await db.exec("grant all on all tables in schema public to authenticated; grant select on profiles to anon");
  monday = await scalar("select (date_trunc('week', now() at time zone 'UTC')::date - 7)::text");
  wednesday = shiftDateKey(monday, 2);
  for (const [id, username] of [[A, "alice"], [B, "bob"], [C, "carol"]]) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${username}@example.test`]);
    await db.query("insert into profiles (id, username) values ($1, $2)", [id, username]);
  }
  await db.query("insert into habits (id, user_id, name, category, scheduled_days, created_at) values ($1, $2, 'PRIVATE HABIT', 'Discipline', '{1,3}', '2020-01-01Z')", [H, A]);
  await db.query("insert into habits (id, user_id, name, category) values ($1, $2, 'BOB PRIVATE', 'Discipline')", [HB, B]);
  for (const date of [monday, wednesday]) {
    await db.query("insert into habit_logs (habit_id, user_id, log_date, status) values ($1,$2,$3,'complete')", [H, A, date]);
  }
  await db.query("insert into friendships (requester_id, addressee_id, status) values ($1,$2,'accepted')", [A, B]);
  assert.ok(await scalar("select count(*)::int from feed_events where habit_name = 'PRIVATE HABIT'"));
  await db.exec(fs.readFileSync("supabase/migrations/20260914000000_foundation_repair.sql", "utf8"));
  await asUser(A, () => db.query("insert into user_preferences (user_id, timezone) values ($1,'America/Toronto')", [A]));
});
after(async () => { await db.close(); });

test("migration scrubs historical private feed snapshots", async () => {
  assert.equal(await scalar("select count(*)::int from feed_events where habit_name is not null or habit_id is not null or status is not null or logged_late is not null"), 0);
});

test("direct friendship inserts require the caller as requester and pending status", async () => {
  await asUser(A, async () => {
    await denied(() => db.query("insert into friendships (requester_id,addressee_id,status) values ($1,$2,'accepted')", [A, C]));
    await denied(() => db.query("insert into friendships (requester_id,addressee_id) values ($1,$2)", [B, C]));
    await db.query("insert into friendships (requester_id,addressee_id) values ($1,$2)", [A, C]);
  });
  await asUser(A, async () => {
    const result = await db.query("update friendships set status='accepted' where requester_id=$1 and addressee_id=$2", [A, C]);
    assert.equal(result.affectedRows, 0);
  });
  await asUser(C, async () => {
    await denied(() => db.query("update friendships set requester_id=$1, status='accepted' where requester_id=$2 and addressee_id=$3", [B, A, C]));
    await denied(() => db.query("update friendships set addressee_id=$1, status='accepted' where requester_id=$2 and addressee_id=$3", [B, A, C]));
    assert.equal((await db.query("update friendships set status='declined' where requester_id=$1 and addressee_id=$2", [A, C])).affectedRows, 1);
  });
  await asUser(A, () => db.query("insert into friendships (requester_id,addressee_id) values ($1,$2)", [A, C]));
  await asUser(C, () => db.query("update friendships set status='accepted' where requester_id=$1 and addressee_id=$2 and status='pending'", [A, C]));
  await asUser(A, () => db.query("delete from friendships where requester_id=$1 and addressee_id=$2", [A, C]));
});

test("friends receive summary fields only by default; detail opt-in and revocation apply immediately", async () => {
  const get = () => scalar("select get_friend_day_summary($1,$2)", [A, wednesday]);
  const summary = await asUser(B, get);
  assert.equal(summary.username, "alice");
  assert.equal(summary.complete_count, 1);
  assert.equal(summary.total_count, 1);
  assert.equal(summary.completion, 100);
  assert.equal(summary.details_visible, false);
  assert.equal("statuses" in summary, false);
  assert.equal("missed_count" in summary, false);
  assert.equal(JSON.stringify(summary).includes("PRIVATE"), false);
  await asUser(A, () => db.exec("update user_preferences set share_detailed_activity = true"));
  assert.equal((await asUser(B, get)).statuses[0].habit_name, "PRIVATE HABIT");
  await asUser(A, () => db.exec("update user_preferences set share_detailed_activity = false"));
  assert.equal("statuses" in await asUser(B, get), false);
  assert.equal((await asUser(A, get)).statuses[0].habit_name, "PRIVATE HABIT");
});

test("unauthenticated and unrelated callers cannot read summaries or streaks", async () => {
  for (const [id, role] of [[null, "anon"], [null, "authenticated"], [C, "authenticated"]]) {
    await asUser(id, async () => {
      await denied(() => db.query("select get_friend_day_summary($1,$2)", [A, wednesday]));
      await denied(() => db.query("select get_friend_streak($1)", [A]));
    }, role);
  }
});

test("raw habit data, other preferences, and internal definer functions remain inaccessible", async () => {
  await asUser(B, async () => {
    assert.equal(await scalar("select count(*)::int from habits where user_id=$1", [A]), 0);
    assert.equal(await scalar("select count(*)::int from habit_logs where user_id=$1", [A]), 0);
    assert.equal(await scalar("select count(*)::int from user_preferences where user_id=$1", [A]), 0);
    assert.equal((await db.query("update user_preferences set share_detailed_activity=true where user_id=$1", [A])).affectedRows, 0);
    await denied(() => db.query("select check_and_insert_milestone($1)", [A]));
    await denied(() => db.query("select compute_current_streak($1)", [A]));
    await denied(() => db.query("select user_today($1)", [A]));
    const events = await db.query("select * from feed_events where user_id=$1", [A]);
    assert.ok(events.rows.length > 0);
    assert.ok(events.rows.every((e) => e.habit_name === null && e.habit_id === null && e.status === null));
  });
});

test("SQL and TypeScript both retain Monday/Wednesday streak across unscheduled Tuesday", async () => {
  const keys = [monday, shiftDateKey(monday, 1), wednesday];
  const expected = stats.simulateStreak([{ scheduledDays: [1, 3], logsByDate: { [monday]: "complete", [wednesday]: "complete" } }], keys).streak;
  assert.equal(expected, 2);
  assert.equal(await scalar("select classify_date($1,$2)", [A, keys[1]]), "unscheduled");
  assert.equal(await scalar("select compute_current_streak($1,$2)", [A, wednesday]), expected);
});

test("SQL timezone boundaries match TypeScript regardless of database session timezone", async () => {
  await db.exec("set timezone='Asia/Tokyo'");
  try {
    for (const instant of ["2026-09-15T02:30:00Z", "2026-03-09T04:30:00Z", "2026-11-02T04:30:00Z", "2027-01-01T05:00:00Z"]) {
      assert.equal(await scalar("select user_today($1,$2)::text", [A, instant]), calendarDays(new Date(instant), "America/Toronto").today);
    }
  } finally { await db.exec("set timezone='UTC'"); }
  await asUser(A, () => assert.rejects(() => db.exec("update user_preferences set timezone='Not/AZone'"), (error) => error.code === "22023"));
});

test("SQL matches TypeScript rest, vacation, mixed-status and failure rules", async () => {
  const cases = [
    ["complete", "complete", "complete", "rest"],
    ["complete", "complete", "complete", "rest", "rest"],
    ["complete", "complete", "complete", "rest", "rest", "rest"],
    ["complete", ...Array(7).fill("vacation")],
    ["complete", ...Array(8).fill("vacation")],
    ["complete", "empty", "complete"],
    ["complete", "missed", "complete"]
  ];
  const user = "00000000-0000-4000-8000-000000000010";
  const habitId = "10000000-0000-4000-8000-000000000010";
  for (const statuses of cases) {
    await db.exec("begin");
    try {
      await db.query("insert into auth.users(id) values ($1)", [user]);
      await db.query("insert into habits(id,user_id,name,category) values ($1,$2,'fixture','Discipline')", [habitId, user]);
      const keys = statuses.map((_, i) => shiftDateKey(monday, i - 14));
      const logs = Object.fromEntries(keys.map((key, i) => [key, statuses[i]]));
      // Load historical fixtures as an administrator. Only fixture insertion
      // skips triggers; the actual scoring functions run unchanged below.
      await db.exec("set local session_replication_role = replica");
      for (const [date, status] of Object.entries(logs)) {
        if (status !== "empty") await db.query("insert into habit_logs(habit_id,user_id,log_date,status) values ($1,$2,$3,$4)", [habitId, user, date, status]);
      }
      await db.exec("set local session_replication_role = origin");
      const habits = [{ scheduledDays: [1, 2, 3, 4, 5, 6, 7], logsByDate: logs }];
      assert.equal(await scalar("select compute_current_streak($1,$2)", [user, keys.at(-1)]), stats.simulateStreak(habits, keys).streak);
    } finally { await db.exec("rollback"); }
  }
});

test("database enforces local edit window, ownership, late flags and safe live signals", async () => {
  const today = await scalar("select user_today($1)::text", [A]);
  const yesterday = shiftDateKey(today, -1);
  await asUser(A, async () => {
    await denied(() => db.query("update habit_logs set log_date=$1 where habit_id=$2 and log_date=$3", [today, H, monday]));
    await assert.rejects(() => db.query("insert into habit_logs (habit_id,user_id,log_date,status) values ($1,$2,$3,'complete')", [H, A, shiftDateKey(today, -2)]), (error) => error.code === "22023");
    await assert.rejects(() => db.query("insert into habit_logs (habit_id,user_id,log_date,status) values ($1,$2,$3,'complete')", [H, A, shiftDateKey(today, 1)]), (error) => error.code === "22023");
    await denied(() => db.query("insert into habit_logs (habit_id,user_id,log_date,status) values ($1,$2,$3,'complete')", [HB, A, today]));
    await db.query("insert into habit_logs (habit_id,user_id,log_date,status,logged_late) values ($1,$2,$3,'complete',false)", [H, A, yesterday]);
    assert.equal(await scalar("select logged_late from habit_logs where habit_id=$1 and log_date=$2", [H, yesterday]), true);
    await db.query("insert into habit_logs (habit_id,user_id,log_date,status) values ($1,$2,$3,'rest')", [H, A, today]);
    await db.query("update habit_logs set status='vacation' where habit_id=$1 and log_date=$2", [H, today]);
    await db.query("delete from habit_logs where habit_id=$1 and log_date=$2", [H, today]);
  });
  assert.equal(await scalar("select count(*)::int from feed_events where user_id=$1 and log_date=$2", [A, today]), 3);
  assert.equal(await scalar("select count(*)::int from feed_events where habit_name is not null or habit_id is not null or status is not null"), 0);
});

test("removing a friendship revokes both RPC and raw feed reads", async () => {
  await asUser(B, () => db.query("delete from friendships where requester_id=$1 and addressee_id=$2", [A, B]));
  await asUser(B, async () => {
    await denied(() => db.query("select get_friend_day_summary($1,$2)", [A, wednesday]));
    assert.equal(await scalar("select count(*)::int from feed_events where user_id=$1", [A]), 0);
  });
});
