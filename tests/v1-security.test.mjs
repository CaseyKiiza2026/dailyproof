import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("proof records and storage enforce ownership and explicit friend sharing", async () => {
  const db = new PGlite();
  try {
    await db.exec(fs.readFileSync("tests/fixtures/base-schema.sql", "utf8"));
    await db.exec(
      "alter default privileges in schema public grant all on tables to anon,authenticated",
    );
    await db.exec(
      "grant select,insert,update,delete on public.habits,public.habit_logs to authenticated",
    );
    await db.exec(
      "create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;",
    );
    for (const file of fs
      .readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(fs.readFileSync("supabase/migrations/" + file, "utf8"));
    const a = "00000000-0000-4000-8000-000000000001",
      b = "00000000-0000-4000-8000-000000000002";
    await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
    await db.query(
      "insert into profiles(id,username) values($1,'alice'),($2,'bob')",
      [a, b],
    );
    await db.query(
      "insert into user_preferences(user_id,timezone) values($1,'UTC'),($2,'UTC')",
      [a, b],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    await db.query(
      "insert into friendships(requester_id,addressee_id) values($1,$2)",
      [a, b],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    await db.query(
      "update friendships set status='accepted' where requester_id=$1",
      [a],
    );
    const {
      rows: [task],
    } = await db.query(
      "insert into tasks(user_id,title,status) values($1,'Private task','completed') returning id",
      [a],
    );
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    const {
      rows: [proof],
    } = await db.query(
      "insert into proofs(user_id,task_id,type,content,visibility) values($1,$2,'note','Private proof','friends') returning id",
      [a, task.id],
    );
    await assert.rejects(() =>
      db.query(
        "insert into proofs(user_id,task_id,type) values($1,$2,'image')",
        [a, task.id],
      ),
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    assert.equal((await db.query("select * from proofs")).rows.length, 0);
    await assert.rejects(() =>
      db.query(
        "insert into proofs(user_id,task_id,type,content) values($1,$2,'note','Stolen')",
        [b, task.id],
      ),
    );
    await assert.rejects(() =>
      db.query(
        "insert into storage.objects(bucket_id,name) values('proofs',$1)",
        [`${a}/${proof.id}`],
      ),
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    await db.query(
      "update user_preferences set share_proofs=true,share_detailed_activity=true where user_id=$1",
      [a],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    assert.equal((await db.query("select * from proofs")).rows.length, 1);
    assert.equal(
      (await db.query("update proofs set content='Hacked' returning id")).rows
        .length,
      0,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    await db.query(
      "update user_preferences set share_proofs=false where user_id=$1",
      [a],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    assert.equal((await db.query("select * from proofs")).rows.length, 0);
    await assert.rejects(() =>
      db.query("select public.claim_push_notifications()"),
    );
    await db.exec("reset role");
    const {
      rows: [notice],
    } = await db.query(
      "insert into notifications(user_id,type,title,body,source_key) values($1,'test','Notice','Body','test') returning id",
      [a],
    );
    const claim1 = await db.query(
      "select * from public.claim_push_notifications()",
    );
    assert.equal(claim1.rows.length, 1);
    assert.equal(
      (await db.query("select * from public.claim_push_notifications()")).rows
        .length,
      0,
    );
    await db.query(
      "select public.finish_push_notification($1,1,'failed','Simulated outage')",
      [notice.id],
    );
    assert.equal(
      (
        await db.query("select push_status from notifications where id=$1", [
          notice.id,
        ])
      ).rows[0].push_status,
      "pending",
    );
    await db.query(
      "update notifications set next_attempt=now()-interval '1 minute' where id=$1",
      [notice.id],
    );
    const claim2 = await db.query(
      "select * from public.claim_push_notifications()",
    );
    assert.equal(claim2.rows[0].id, notice.id);
    await db.query("select public.finish_push_notification($1,2,'sent',null)", [
      notice.id,
    ]);
    assert.equal(
      (await db.query("select * from public.claim_push_notifications()")).rows
        .length,
      0,
    );
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    await assert.rejects(() =>
      db.query("update notifications set body='Spoofed' where id=$1", [
        notice.id,
      ]),
    );
    await db.query("update notifications set read_at=now() where id=$1", [
      notice.id,
    ]);
    await db.query("insert into notification_settings(user_id) values($1)", [
      a,
    ]);
    await assert.rejects(() =>
      db.query(
        "update notification_settings set push_alias='spoofed' where user_id=$1",
        [a],
      ),
    );
    await assert.rejects(() =>
      db.query(
        "insert into ai_usage(user_id,window_start,requests) values($1,now(),0)",
        [a],
      ),
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    assert.equal(
      (await db.query("select * from notifications")).rows.length,
      0,
    );
    const create = {
      tool: "create_task",
      id: "10000000-0000-4000-8000-000000000001",
      values: {
        title: "Planned task",
        description: "",
        due_at: null,
        scheduled_start: null,
        scheduled_end: null,
        status: "pending",
        priority: "normal",
      },
    };
    const {
      rows: [badPlan],
    } = await db.query(
      "insert into ai_plans(user_id,actions) values($1,$2) returning id",
      [
        b,
        JSON.stringify([
          create,
          { ...create, tool: "update_task", id: task.id },
        ]),
      ],
    );
    await assert.rejects(() =>
      db.query("select apply_ai_plan($1)", [badPlan.id]),
    );
    assert.equal(
      (await db.query("select * from tasks")).rows.length,
      0,
      "a failed plan rolls back earlier writes",
    );
    const {
      rows: [plan],
    } = await db.query(
      "insert into ai_plans(user_id,actions) values($1,$2) returning id",
      [b, JSON.stringify([create])],
    );
    await db.query("select apply_ai_plan($1)", [plan.id]);
    await assert.rejects(() => db.query("select apply_ai_plan($1)", [plan.id]));
    assert.equal(
      (await db.query("select * from tasks")).rows.length,
      1,
      "approved plan applies once",
    );
    await assert.rejects(() =>
      db.query("select apply_work_actions($1)", [
        JSON.stringify([{ tool: "move_commitment", id: task.id, values: {} }]),
      ]),
    );
    for (let i = 0; i < 5; i++)
      await db.query(
        "insert into tasks(user_id,title,due_at,status) values($1,'SECRET TASK',now(),$2)",
        [b, i < 4 ? "completed" : "pending"],
      );
    const daily = (
      await db.query("select get_friend_day_summary($1) as summary", [b])
    ).rows[0].summary;
    assert.equal(daily.completion, 80);
    assert.equal(daily.complete_count, 4);
    assert.equal(daily.total_count, 5);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    const friend = (
      await db.query("select get_friend_day_summary($1) as summary", [b])
    ).rows[0].summary;
    assert.equal(friend.completion, 80);
    assert.equal(JSON.stringify(friend).includes("SECRET TASK"), false);
    await db.query(
      "insert into habits(user_id,name,category,scheduled_days,scheduled_time,duration_minutes) values($1,'Timed habit','Discipline',array[1,2,3,4,5,6,7],'09:00',30)",
      [a],
    );
    await assert.rejects(() =>
      db.query(
        "insert into tasks(user_id,title,scheduled_start,scheduled_end) values($1,'Overlap','2040-01-01T09:15Z','2040-01-01T10:00Z')",
        [a],
      ),
    );
    await db.query(
      "insert into tasks(user_id,title,scheduled_start,scheduled_end) values($1,'Free slot','2040-01-01T10:00Z','2040-01-01T10:30Z')",
      [a],
    );
    await assert.rejects(() =>
      db.query("select apply_work_actions($1)", [
        JSON.stringify([
          {
            tool: "update_task",
            id: task.id,
            expected_updated_at: "2020-01-01T00:00:00Z",
            values: create.values,
          },
        ]),
      ]),
    );
    await db.exec("reset role");
    const {
      rows: [retryReminder],
    } = await db.query(
      "insert into reminders(user_id,title,scheduled_at,status) values($1,'Retry test','2040-01-01T12:00Z','queued') returning id",
      [a],
    );
    await db.query(
      "insert into notifications(user_id,type,title,body,source_key,reminder_id,push_status,attempts,lease_until) values($1,'scheduled_reminder','Retry test','','expired-retry',$2,'sending',6,now()-interval '1 minute')",
      [a, retryReminder.id],
    );
    await db.query("select * from claim_push_notifications()");
    assert.equal(
      (
        await db.query("select status from reminders where id=$1", [
          retryReminder.id,
        ])
      ).rows[0].status,
      "failed",
      "an exhausted crashed delivery also finalizes its reminder",
    );
    await db.exec(
      "set role authenticated;select set_config('request.jwt.claim.sub','',false)",
    );
    await assert.rejects(() =>
      db.query("select get_friend_day_summary($1)", [a]),
    );
    await assert.rejects(() =>
      db.query("select apply_work_actions($1)", [JSON.stringify([create])]),
    );
  } finally {
    await db.close();
  }
});
