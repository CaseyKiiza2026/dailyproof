import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { p0Database } from "./p0-database.mjs";
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const at = (hour) => `2099-01-05T${String(hour).padStart(2, "0")}:00:00Z`;

test("coordinated schedule database regression and authorization", async (t) => {
  const db = await p0Database();
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
    const first = (
      await db.query(
        "insert into tasks(user_id,title,scheduled_start,scheduled_end) values($1,'A',$2,$3) returning id",
        [owner, at(9), at(10)],
      )
    ).rows[0].id;
    const second = (
      await db.query(
        "insert into tasks(user_id,title,scheduled_start,scheduled_end) values($1,'B',$2,$3) returning id",
        [owner, at(10), at(11)],
      )
    ).rows[0].id;
    const foreign = (
      await db.query(
        "insert into tasks(user_id,title,scheduled_start,scheduled_end) values($1,'Other',$2,$3) returning id",
        [other, at(9), at(10)],
      )
    ).rows[0].id;
    await db.query(
      "insert into commitments(user_id,title,start_at,end_at) values($1,'Fixed',$2,$3)",
      [owner, at(14), at(15)],
    );
    await db.query(
      "insert into habits(user_id,name,category,scheduled_days,scheduled_time,duration_minutes) values($1,'Timed','Discipline',array[1,2,3,4,5,6,7],'16:00',60)",
      [owner],
    );
    await db.exec("set role authenticated");
    const snapshot = async () =>
      (
        await db.query(
          "select id,scheduled_start::text,scheduled_end::text,updated_at::text,title from tasks order by id",
        )
      ).rows;
    const action = async (id, hour, end = hour + 1) => ({
      tool: "update_task",
      id,
      expected_updated_at: (
        await db.query("select updated_at::text from tasks where id=$1", [id])
      ).rows[0]?.updated_at,
      values: {
        title: id === first ? "A" : "B",
        description: "",
        due_at: null,
        scheduled_start: at(hour),
        scheduled_end: at(end),
        status: "pending",
        priority: "normal",
      },
    });
    const apply = (actions) =>
      db.query("select apply_work_actions($1::jsonb)", [
        JSON.stringify(actions),
      ]);
    async function isolated(name, work) {
      await t.test(name, async () => {
        await db.exec("begin");
        try {
          await work();
        } finally {
          await db.exec("rollback");
        }
      });
    }
    await isolated(
      "old migration reproduces chain failure; additive replacement fixes it",
      async () => {
        const source = fs.readFileSync(
          "supabase/migrations/20260914140000_ai_operations.sql",
          "utf8",
        );
        await db.exec("reset role");
        await db.exec(
          source
            .slice(
              source.indexOf("create function public.apply_work_actions"),
              source.indexOf(
                "revoke all on function public.apply_work_actions",
              ),
            )
            .replace("create function", "create or replace function"),
        );
        await db.exec("set role authenticated; savepoint old_failure");
        const actions = [await action(first, 10), await action(second, 11)];
        await assert.rejects(() => apply(actions), /overlaps/);
        await db.exec("rollback to old_failure; reset role");
        await db.exec(
          fs.readFileSync(
            "supabase/migrations/20260915110000_coordinated_task_rescheduling.sql",
            "utf8",
          ),
        );
        await db.exec("set role authenticated");
        await apply(actions);
        assert.equal(
          new Date(
            (
              await db.query("select scheduled_start from tasks where id=$1", [
                first,
              ])
            ).rows[0].scheduled_start,
          ).getUTCHours(),
          10,
        );
        assert.equal(
          new Date(
            (
              await db.query("select scheduled_start from tasks where id=$1", [
                second,
              ])
            ).rows[0].scheduled_start,
          ).getUTCHours(),
          11,
        );
      },
    );
    for (const reverse of [false, true])
      await isolated(
        `final chain and swap succeed, reverse=${reverse}`,
        async () => {
          let actions = [await action(first, 10), await action(second, 11)];
          await apply(reverse ? actions.reverse() : actions);
          actions = [await action(first, 11), await action(second, 10)];
          await apply(reverse ? actions.reverse() : actions);
          const hours = (
            await db.query(
              "select id,extract(hour from scheduled_start at time zone 'UTC')::int as hour from tasks",
            )
          ).rows;
          assert.equal(hours.find((r) => r.id === first).hour, 11);
          assert.equal(hours.find((r) => r.id === second).hour, 10);
        },
      );
    for (const [name, hours] of [
      ["final overlap", [11, 11]],
      ["fixed commitment", [14, 11]],
      ["recurring habit", [16, 11]],
      ["invalid range", [12, 11]],
    ])
      await isolated(
        `${name} rejected with all rows and plan state unchanged`,
        async () => {
          const actions = [
            await action(second, hours[1]),
            await action(
              first,
              hours[0],
              name === "invalid range" ? 11 : hours[0] + 1,
            ),
          ];
          const before = await snapshot();
          const plan = (
            await db.query(
              "insert into ai_plans(user_id,actions) values($1,$2) returning id",
              [owner, JSON.stringify(actions)],
            )
          ).rows[0];
          await db.exec("savepoint reject");
          await assert.rejects(() =>
            db.query("select apply_ai_plan($1)", [plan.id]),
          );
          await db.exec("rollback to reject");
          assert.deepEqual(await snapshot(), before);
          assert.equal(
            (
              await db.query("select status from ai_plans where id=$1", [
                plan.id,
              ])
            ).rows[0].status,
            "pending",
          );
        },
      );
    await isolated(
      "cross-owner update fails and rolls back whole group",
      async () => {
        const before = await snapshot();
        const actions = [
          await action(first, 12),
          {
            ...(await action(second, 13)),
            id: foreign,
            expected_updated_at: undefined,
          },
        ];
        await db.exec("savepoint reject");
        await assert.rejects(() => apply(actions), /Task not found/);
        await db.exec("rollback to reject");
        assert.deepEqual(await snapshot(), before);
        assert.equal(
          (await db.query("select * from tasks where id=$1", [foreign])).rows
            .length,
          0,
        );
      },
    );
    await isolated(
      "stale plan is rejected before staging even after another edit",
      async () => {
        const actions = [await action(first, 10), await action(second, 11)];
        await db.query(
          "update tasks set title='Edited after review' where id=$1",
          [second],
        );
        const before = await snapshot();
        await db.exec("savepoint reject");
        await assert.rejects(() => apply(actions), /changed after review/);
        await db.exec("rollback to reject");
        assert.deepEqual(await snapshot(), before);
      },
    );
    await isolated(
      "applied plan cannot replay and expired plan cannot apply",
      async () => {
        const actions = [await action(first, 10), await action(second, 11)];
        const plan = (
          await db.query(
            "insert into ai_plans(user_id,actions) values($1,$2) returning id",
            [owner, JSON.stringify(actions)],
          )
        ).rows[0];
        await db.query("select apply_ai_plan($1)", [plan.id]);
        await db.exec("savepoint replay");
        await assert.rejects(
          () => db.query("select apply_ai_plan($1)", [plan.id]),
          /expired or already applied/,
        );
        await db.exec("rollback to replay");
        await db.exec("reset role");
        const expired = (
          await db.query(
            "insert into ai_plans(user_id,actions,expires_at) values($1,$2,now()-interval '1 minute') returning id",
            [owner, JSON.stringify(actions)],
          )
        ).rows[0];
        await db.exec("set role authenticated; savepoint expired");
        await assert.rejects(
          () => db.query("select apply_ai_plan($1)", [expired.id]),
          /expired or already applied/,
        );
        await db.exec("rollback to expired");
      },
    );
    await isolated(
      "a new task can occupy a moved task's old slot regardless of action order",
      async () => {
        const create = {
          ...(await action(first, 9)),
          tool: "create_task",
          id: "10000000-0000-4000-8000-000000000001",
          expected_updated_at: undefined,
        };
        await apply([create, await action(first, 12)]);
        assert.equal(
          (await db.query("select count(*)::int as count from tasks")).rows[0]
            .count,
          3,
        );
      },
    );
    await isolated(
      "unmoved tasks still block a coordinated proposal",
      async () => {
        const before = await snapshot();
        const create = {
          ...(await action(first, 13)),
          tool: "create_task",
          id: "10000000-0000-4000-8000-000000000001",
          expected_updated_at: undefined,
        };
        const move = await action(first, 10);
        await db.exec("savepoint conflict");
        await assert.rejects(() => apply([create, move]), /overlaps/);
        await db.exec("rollback to conflict");
        assert.deepEqual(await snapshot(), before);
      },
    );
    await isolated(
      "stale reminder in a mixed plan rolls back the staged task moves",
      async () => {
        const reminder = (
          await db.query(
            "insert into reminders(user_id,title,scheduled_at) values($1,'Reminder',$2) returning id",
            [owner, at(18)],
          )
        ).rows[0];
        const actions = [
          await action(first, 10),
          await action(second, 11),
          {
            tool: "cancel_reminder",
            id: reminder.id,
            expected_updated_at: "2000-01-01T00:00:00Z",
            values: {},
          },
        ];
        const before = await snapshot();
        await db.exec("savepoint stale_reminder");
        await assert.rejects(() => apply(actions), /changed after review/);
        await db.exec("rollback to stale_reminder");
        assert.deepEqual(await snapshot(), before);
        assert.equal(
          (
            await db.query("select status from reminders where id=$1", [
              reminder.id,
            ])
          ).rows[0].status,
          "pending",
        );
      },
    );
    await isolated(
      "single manual move and direct SQL still reject conflicts",
      async () => {
        const move = await action(first, 10);
        await db.exec("savepoint conflict");
        await assert.rejects(() => apply([move]), /overlaps/);
        await db.exec("rollback to conflict");
        await db.exec("savepoint direct");
        await assert.rejects(
          () =>
            db.query(
              "update tasks set scheduled_start=$1,scheduled_end=$2 where id=$3",
              [at(10), at(11), first],
            ),
          /overlaps/,
        );
        await db.exec("rollback to direct");
      },
    );
    await isolated(
      "duplicate task targets rejected; anonymous caller denied",
      async () => {
        const move = await action(first, 12);
        await db.exec("savepoint duplicate");
        await assert.rejects(() => apply([move, move]), /one final change/);
        await db.exec("rollback to duplicate");
        await db.query("select set_config('request.jwt.claim.sub','',true)");
        await db.exec("savepoint anon");
        await assert.rejects(() => apply([move]), /Authentication required/);
        await db.exec("rollback to anon");
      },
    );
  } finally {
    await db.close();
  }
});
