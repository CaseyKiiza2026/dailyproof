import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";
const { validateProposedSchedule, calendarFreeSlots } = loadTypeScript(
  "lib/work-schedule.ts",
);
const at = (h) => `2099-01-05T${String(h).padStart(2, "0")}:00:00Z`;
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const task = (n, h) => ({
  id: id(n),
  title: String(n),
  description: "",
  due_at: null,
  scheduled_start: at(h),
  scheduled_end: at(h + 1),
  status: "pending",
  priority: "normal",
});
const original = {
  tasks: [task(1, 9), task(2, 10)],
  commitments: [{ start_at: at(14), end_at: at(15) }],
  habits: [
    {
      scheduled_days: [1, 2, 3, 4, 5, 6, 7],
      scheduled_time: "16:00",
      duration_minutes: 60,
    },
  ],
};
const move = (n, h) => ({ tool: "update_task", id: id(n), values: task(n, h) });
test("AI precheck permits final chain and swap independent of action order", () => {
  for (const actions of [
    [move(1, 10), move(2, 11)],
    [move(2, 11), move(1, 10)],
    [move(1, 10), move(2, 9)],
  ])
    assert.doesNotThrow(() =>
      validateProposedSchedule(original, actions, "UTC"),
    );
  assert.equal(original.tasks[0].scheduled_start, at(9));
});
test("AI precheck rejects final overlaps, unmoved work, commitments and recurring habits", () => {
  for (const actions of [
    [move(1, 11), move(2, 11)],
    [move(1, 10)],
    [move(1, 14), move(2, 11)],
    [move(1, 16), move(2, 11)],
  ])
    assert.throws(
      () => validateProposedSchedule(original, actions, "UTC"),
      /overlap/,
    );
});
test("AI precheck preserves range, due, duration, ownership-snapshot and duplicate-target checks", () => {
  for (const values of [
    { ...task(1, 12), scheduled_end: at(11) },
    { ...task(1, 12), due_at: at(12) },
    { ...task(1, 1), scheduled_end: at(14) },
  ])
    assert.throws(() =>
      validateProposedSchedule(original, [{ ...move(1, 12), values }], "UTC"),
    );
  assert.throws(
    () => validateProposedSchedule(original, [move(3, 12)], "UTC"),
    /not found/,
  );
  assert.throws(
    () => validateProposedSchedule(original, [move(1, 12), move(1, 13)], "UTC"),
    /one final change/,
  );
});
test("free-slot read shares recurring-habit checks and leaves completed task blocks protected", () => {
  assert.equal(
    calendarFreeSlots(original, "UTC", at(16), at(17), 60).length,
    0,
  );
  assert.equal(
    calendarFreeSlots(
      { ...original, tasks: [{ ...task(1, 9), status: "completed" }] },
      "UTC",
      at(9),
      at(10),
      60,
    ).length,
    0,
  );
});
