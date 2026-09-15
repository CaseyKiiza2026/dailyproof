import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
test('task ownership and schedule constraints are enforced by PostgreSQL', async () => {
  const db=new PGlite();
  try {
    await db.exec(fs.readFileSync('tests/fixtures/base-schema.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20260914100000_tasks.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20260914110000_calendar.sql','utf8'));
    const a='00000000-0000-4000-8000-000000000001', b='00000000-0000-4000-8000-000000000002';
    await db.query('insert into auth.users(id) values ($1),($2)',[a,b]);
    await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
    await assert.rejects(()=>db.query("insert into tasks(user_id,title) values($1,'Intrusion')",[b]));
    const {rows}=await db.query("insert into tasks(user_id,title) values($1,'Private task') returning id",[a]);
    await db.query("insert into commitments(user_id,title,start_at,end_at) values($1,'Work','2026-09-14T09:00Z','2026-09-14T10:00Z')",[a]);
    await assert.rejects(()=>db.query("update tasks set scheduled_start='2026-09-14T09:30Z',scheduled_end='2026-09-14T10:30Z' where id=$1",[rows[0].id]));
    await db.query("update tasks set scheduled_start='2026-09-14T10:00Z',scheduled_end='2026-09-14T11:00Z' where id=$1",[rows[0].id]);
    await assert.rejects(()=>db.query("update tasks set scheduled_start=null where id=$1",[rows[0].id]));
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
    assert.equal((await db.query('select * from tasks')).rows.length,0);
    assert.equal((await db.query("update tasks set title='Hacked' returning id")).rows.length,0);
    assert.equal((await db.query('delete from tasks returning id')).rows.length,0);
  } finally { await db.close(); }
});
