import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from './load-typescript.mjs';
const { taskBucket, validateTask } = loadTypeScript('lib/tasks.ts');
const { localDateTimeToUtc } = loadTypeScript('lib/timezone.ts');
const task = {title:'Study',description:'',status:'pending',priority:'normal',due_at:null,scheduled_start:null,scheduled_end:null};
const { freeSlots } = loadTypeScript('lib/calendar.ts');
test('free slots merge overlapping fixed blocks and enforce duration',()=>{
 const slots=freeSlots('2026-09-14T09:00:00Z','2026-09-14T13:00:00Z',30,[{start:'2026-09-14T10:00:00Z',end:'2026-09-14T11:00:00Z'},{start:'2026-09-14T10:30:00Z',end:'2026-09-14T12:00:00Z'}]);
 assert.equal(slots.length,2);assert.equal(slots[1].start,'2026-09-14T12:00:00.000Z');
 assert.throws(()=>freeSlots('2026-09-14T09:00:00Z','2026-09-14T13:00:00Z',0,[]));
});
test('task buckets follow the saved timezone across midnight and week boundaries', () => {
  const bucket=(due)=>taskBucket({...task,due_at:due},'2026-09-14','America/Toronto');
  assert.equal(bucket(null),'Due someday');
  assert.equal(bucket('2026-09-15T02:00:00Z'),'Due today');
  assert.equal(bucket('2026-09-15T14:00:00Z'),'Due tomorrow');
  assert.equal(bucket('2026-09-18T14:00:00Z'),'Due this week');
  assert.equal(bucket('2026-09-21T14:00:00Z'),'Due later');
  assert.equal(bucket('2026-09-13T14:00:00Z'),'Overdue');
  assert.equal(taskBucket({...task,status:'completed'},'2026-09-14','UTC'),'Completed');
});
test('wall time conversion handles offsets and rejects DST gaps and repeated hours', () => {
  assert.equal(localDateTimeToUtc('2026-09-14T19:00','America/Toronto'),'2026-09-14T23:00:00.000Z');
  assert.equal(localDateTimeToUtc('2026-09-14T19:00','Asia/Kathmandu'),'2026-09-14T13:15:00.000Z');
  assert.throws(()=>localDateTimeToUtc('2026-03-08T02:30','America/Toronto'));
  assert.throws(()=>localDateTimeToUtc('2026-11-01T01:30','America/Toronto'));
});
test('task validation rejects malformed schedules, statuses and titles', () => {
  assert.throws(()=>validateTask({...task,title:' '}));
  assert.throws(()=>validateTask({...task,status:'other'}));
  assert.throws(()=>validateTask({...task,scheduled_start:'2026-09-14T18:00:00Z'}));
  assert.throws(()=>validateTask({...task,due_at:'2026-09-14T18:00'}));
  assert.equal(validateTask({...task,title:' Study '}).title,'Study');
});
