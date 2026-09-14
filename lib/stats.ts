import { Habit } from "@/lib/types";
import { isoDayOfWeek } from "@/lib/dates";

export type DayType = "success" | "fail" | "rest" | "vacation" | "empty" | "unscheduled";

function isScheduledOn(habit: Habit, dow: number): boolean {
  return habit.scheduledDays.includes(dow);
}

// A day is "success"/"fail" based on the complete-vs-missed ratio among that
// day's SCHEDULED habits that were actually logged (rest/vacation excluded
// from that ratio, and a habit not scheduled for this day-of-week is excluded
// entirely — never counted, regardless of whether it happens to have a log).
// The threshold is strictly more than 60% (5/7 passes, 4/7 fails), not >=50%.
// If nothing was logged as complete/missed among scheduled habits, the day
// falls back to "vacation" (if any scheduled habit was marked that) or "rest"
// (if any scheduled habit was marked that), or "empty" if nothing was logged.
// A day with nothing scheduled is a separate neutral state. Vacation is
// checked before rest so a mixed rest/vacation day resolves to vacation, per
// spec section 5 ("vacation wins").
export function classifyDate(habits: Habit[], dateKey: string): DayType {
  const dow = isoDayOfWeek(dateKey);
  if (!habits.some((habit) => isScheduledOn(habit, dow))) return "unscheduled";
  let complete = 0;
  let missed = 0;
  let rest = 0;
  let vacation = 0;

  for (const habit of habits) {
    if (!isScheduledOn(habit, dow)) continue;
    const status = habit.logsByDate[dateKey] ?? "empty";
    if (status === "complete") complete++;
    else if (status === "missed") missed++;
    else if (status === "rest") rest++;
    else if (status === "vacation") vacation++;
  }

  const logged = complete + missed;
  if (logged > 0) return complete / logged > 0.6 ? "success" : "fail";
  if (vacation > 0) return "vacation";
  if (rest > 0) return "rest";
  return "empty";
}

// The complete/missed ratio for a day classified "success" or "fail" (used for
// heatmap intensity), scoped to that day's scheduled habits only. Returns 0
// for days with no complete/missed logs at all among scheduled habits.
export function completionRatio(habits: Habit[], dateKey: string): number {
  const dow = isoDayOfWeek(dateKey);
  let complete = 0;
  let missed = 0;
  for (const habit of habits) {
    if (!isScheduledOn(habit, dow)) continue;
    const status = habit.logsByDate[dateKey] ?? "empty";
    if (status === "complete") complete++;
    else if (status === "missed") missed++;
  }
  const denominator = complete + missed;
  return denominator === 0 ? 0 : complete / denominator;
}

// Forward simulation across `dateKeys` (ascending, contiguous days). Rest and
// vacation days don't break a streak outright: a 1st consecutive rest day is
// neutral, a 2nd knocks the streak down by 1 (without zeroing it), and a 3rd
// breaks it. Vacation days freeze the streak for up to 7 days in a row before an
// 8th breaks it. `best` tracks the highest value the streak reached at any point,
// even if it's since been reduced.
export function simulateStreak(habits: Habit[], dateKeys: string[]): { streak: number; best: number } {
  let streak = 0;
  let best = 0;
  let consecutiveRest = 0;
  let consecutiveVacation = 0;

  for (const dateKey of dateKeys) {
    const type = classifyDate(habits, dateKey);

    switch (type) {
      case "unscheduled":
        // No opportunity to log: freeze the streak and rest/vacation counters.
        break;
      case "success":
        streak += 1;
        consecutiveRest = 0;
        consecutiveVacation = 0;
        break;
      case "rest":
        consecutiveVacation = 0;
        consecutiveRest += 1;
        if (consecutiveRest === 2) streak = Math.max(0, streak - 1);
        else if (consecutiveRest >= 3) streak = 0;
        break;
      case "vacation":
        consecutiveRest = 0;
        consecutiveVacation += 1;
        if (consecutiveVacation >= 8) streak = 0;
        break;
      case "fail":
      case "empty":
        streak = 0;
        consecutiveRest = 0;
        consecutiveVacation = 0;
        break;
    }

    best = Math.max(best, streak);
  }

  return { streak, best };
}

// If the last date in the range is empty (zero logs) and it's today, it's skipped
// (not treated as a break) so the streak isn't punished before the day is over —
// per spec section 5 "Today exception". Only ever trims the final entry.
function trimEmptyToday(habits: Habit[], dateKeys: string[]): string[] {
  if (dateKeys.length === 0) return dateKeys;
  const last = dateKeys[dateKeys.length - 1];
  return classifyDate(habits, last) === "empty" ? dateKeys.slice(0, -1) : dateKeys;
}

export function computeCurrentStreak(habits: Habit[], streakDateKeys: string[]): number {
  return simulateStreak(habits, trimEmptyToday(habits, streakDateKeys)).streak;
}

export function computeBestStreak(habits: Habit[], streakDateKeys: string[]): number {
  return simulateStreak(habits, trimEmptyToday(habits, streakDateKeys)).best;
}

// Completion % across a date range, scoped to each day's scheduled habits only
// (a habit not scheduled for a given day never contributes to either side of
// the ratio for that day).
export function computeCompletion(habits: Habit[], dateKeys: string[]): number {
  let complete = 0;
  let missed = 0;
  for (const dateKey of dateKeys) {
    const dow = isoDayOfWeek(dateKey);
    for (const habit of habits) {
      if (!isScheduledOn(habit, dow)) continue;
      const status = habit.logsByDate[dateKey] ?? "empty";
      if (status === "complete") complete++;
      else if (status === "missed") missed++;
    }
  }
  const denominator = complete + missed;
  return denominator === 0 ? 0 : Math.round((complete / denominator) * 100);
}

// A calendar day counts once toward "missed", regardless of how many habits were
// marked missed that day — it counts iff the day itself classifies as "fail"
// (<=60% of that day's scheduled+logged habits complete), the same day-success
// rule used for streak calculation and `computeCompletedCount`. Rest/vacation
// days, and days with nothing scheduled, are never "fail".
export function computeMissedCount(habits: Habit[], dateKeys: string[]): number {
  let missedDays = 0;
  for (const dateKey of dateKeys) {
    if (classifyDate(habits, dateKey) === "fail") missedDays++;
  }
  return missedDays;
}

// A calendar day counts once toward "completed", regardless of how many habits
// were ticked that day — it counts iff the day itself classifies as "success"
// (>60% of that day's scheduled, logged habits complete), the same day-success
// rule used for streak calculation. Reuses `classifyDate`, not a second
// implementation.
export function computeCompletedCount(habits: Habit[], dateKeys: string[]): number {
  let completedDays = 0;
  for (const dateKey of dateKeys) {
    if (classifyDate(habits, dateKey) === "success") completedDays++;
  }
  return completedDays;
}

// Days with at least one log of any kind (complete/missed/rest/vacation) among
// that day's scheduled habits — how many days the user engaged with the app at
// all, as distinct from `completed` (successful days only). Reuses
// `classifyDate` so a day with nothing scheduled is correctly excluded, not
// counted as "tracked".
export function computeDaysTracked(habits: Habit[], dateKeys: string[]): number {
  let tracked = 0;
  for (const dateKey of dateKeys) {
    const type = classifyDate(habits, dateKey);
    if (type !== "empty" && type !== "unscheduled") tracked++;
  }
  return tracked;
}

export interface HabitStats {
  completion: number;
  currentStreak: number;
  bestStreak: number;
  missed: number;
  completed: number;
}

// `monthlyDateKeys` scopes completion/missed/completed (spec section 5: "only
// counts days from the 1st of the month through today"). `streakDateKeys` scopes
// current/best streak, which is a continuous, real-time concept that must not
// reset at month boundaries — callers pass the full history through real today
// here, independent of whichever month is being browsed for the other three.
export function computeHabitStats(habits: Habit[], monthlyDateKeys: string[], streakDateKeys: string[]): HabitStats {
  return {
    completion: computeCompletion(habits, monthlyDateKeys),
    currentStreak: computeCurrentStreak(habits, streakDateKeys),
    bestStreak: computeBestStreak(habits, streakDateKeys),
    missed: computeMissedCount(habits, monthlyDateKeys),
    completed: computeCompletedCount(habits, monthlyDateKeys)
  };
}
