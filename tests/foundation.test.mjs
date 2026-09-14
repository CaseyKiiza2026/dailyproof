import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const stats = loadTypeScript("lib/stats.ts");
const { calendarDays, dateKeyInTimeZone, shiftDateKey, isValidTimeZone } = loadTypeScript("lib/timezone.ts");
const dates = ["2026-09-07", "2026-09-08", "2026-09-09"];
const habit = (logs, scheduledDays = [1, 2, 3, 4, 5, 6, 7]) => ({ scheduledDays, logsByDate: logs });

test("Monday and Wednesday completions retain a streak across unscheduled Tuesday", () => {
  const habits = [habit({ [dates[0]]: "complete", [dates[2]]: "complete" }, [1, 3])];
  assert.equal(stats.classifyDate(habits, dates[1]), "unscheduled");
  assert.deepEqual(stats.simulateStreak(habits, dates), { streak: 2, best: 2 });
  assert.equal(stats.computeDaysTracked(habits, dates), 2);
  assert.equal(stats.computeCompletion(habits, dates), 100);
});

test("a scheduled, unlogged Tuesday still breaks the streak", () => {
  assert.deepEqual(stats.simulateStreak([habit({ [dates[0]]: "complete", [dates[2]]: "complete" })], dates), { streak: 1, best: 1 });
});

test("today without logs is skipped; an earlier empty day is not", () => {
  const habits = [habit({ [dates[0]]: "complete" })];
  assert.equal(stats.computeCurrentStreak(habits, dates.slice(0, 2)), 1);
  assert.equal(stats.computeCurrentStreak(habits, dates), 0);
});

test("rest escalation and best streak are preserved", () => {
  const keys = Array.from({ length: 6 }, (_, i) => shiftDateKey(dates[0], i));
  const h = habit(Object.fromEntries(keys.map((key, i) => [key, i < 3 ? "complete" : "rest"])));
  assert.deepEqual(stats.simulateStreak([h], keys.slice(0, 4)), { streak: 3, best: 3 });
  assert.deepEqual(stats.simulateStreak([h], keys.slice(0, 5)), { streak: 2, best: 3 });
  assert.deepEqual(stats.simulateStreak([h], keys), { streak: 0, best: 3 });
});

test("seven vacation days freeze a streak; the eighth breaks it; vacation wins mixed days", () => {
  const keys = Array.from({ length: 9 }, (_, i) => shiftDateKey(dates[0], i));
  const h = habit(Object.fromEntries(keys.map((key, i) => [key, i === 0 ? "complete" : "vacation"])));
  assert.equal(stats.simulateStreak([h], keys.slice(0, 8)).streak, 1);
  assert.equal(stats.simulateStreak([h], keys).streak, 0);
  assert.equal(stats.classifyDate([habit({ [dates[0]]: "rest" }), habit({ [dates[0]]: "vacation" })], dates[0]), "vacation");
});

test("success requires strictly more than 60 percent; unlogged/rest/vacation are excluded", () => {
  const habits = ["complete", "complete", "complete", "missed", "missed", "rest", "vacation", "empty"]
    .map((status) => habit({ [dates[0]]: status }));
  assert.equal(stats.classifyDate(habits, dates[0]), "fail");
  assert.equal(stats.computeCompletion(habits, [dates[0]]), 60);
});

test("persisted timezone defines day boundaries independently of host timezone", () => {
  const now = new Date("2026-09-15T02:30:00Z");
  assert.deepEqual(calendarDays(now, "America/Toronto"), { today: "2026-09-14", yesterday: "2026-09-13", tomorrow: "2026-09-15" });
  assert.equal(dateKeyInTimeZone(now, "Asia/Tokyo"), "2026-09-15");
  assert.equal(dateKeyInTimeZone(now, "UTC"), "2026-09-15");
});

test("clock advances across local midnight, including month/year boundaries", () => {
  assert.equal(calendarDays(new Date("2027-01-01T04:59:59Z"), "America/Toronto").today, "2026-12-31");
  assert.equal(calendarDays(new Date("2027-01-01T05:00:00Z"), "America/Toronto").today, "2027-01-01");
});

test("yesterday uses calendar arithmetic across both DST transitions", () => {
  assert.equal(calendarDays(new Date("2026-03-09T04:30:00Z"), "America/Toronto").yesterday, "2026-03-08");
  assert.equal(calendarDays(new Date("2026-11-02T04:30:00Z"), "America/Toronto").yesterday, "2026-10-31");
  assert.equal(shiftDateKey("2028-03-01", -1), "2028-02-29");
  assert.equal(isValidTimeZone("Not/AZone"), false);
});

test("unscheduled days do not count as tracked, completed, or missed", () => {
  assert.equal(stats.computeDaysTracked([], dates), 0);
  assert.equal(stats.computeCompletedCount([], dates), 0);
  assert.equal(stats.computeMissedCount([], dates), 0);
});
