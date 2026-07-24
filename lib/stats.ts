import { Habit } from "@/lib/types";

export type DayType = "success" | "fail" | "rest" | "vacation" | "empty";

// A day is "success"/"fail" based on the complete-vs-missed ratio among that day's
// logged habits (rest/vacation excluded from that ratio). If nothing was logged as
// complete/missed, the day falls back to "vacation" (if any habit carries that status)
// or "rest" (if any habit carries that status), or "empty" if nothing was logged at
// all. Vacation is checked before rest so a mixed rest/vacation day resolves to
// vacation, per spec section 5 ("vacation wins").
export function classifyDate(habits: Habit[], dateKey: string): DayType {
  let complete = 0;
  let missed = 0;
  let rest = 0;
  let vacation = 0;

  for (const habit of habits) {
    const status = habit.logsByDate[dateKey] ?? "empty";
    if (status === "complete") complete++;
    else if (status === "missed") missed++;
    else if (status === "rest") rest++;
    else if (status === "vacation") vacation++;
  }

  const logged = complete + missed;
  if (logged > 0) return complete / logged >= 0.5 ? "success" : "fail";
  if (vacation > 0) return "vacation";
  if (rest > 0) return "rest";
  return "empty";
}

// The complete/missed ratio for a day classified "success" or "fail" (used for
// heatmap intensity). Returns 0 for days with no complete/missed logs at all.
export function completionRatio(habits: Habit[], dateKey: string): number {
  let complete = 0;
  let missed = 0;
  for (const habit of habits) {
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

export function computeCompletion(habits: Habit[], dateKeys: string[]): number {
  let complete = 0;
  let missed = 0;
  for (const dateKey of dateKeys) {
    for (const habit of habits) {
      const status = habit.logsByDate[dateKey] ?? "empty";
      if (status === "complete") complete++;
      else if (status === "missed") missed++;
    }
  }
  const denominator = complete + missed;
  return denominator === 0 ? 0 : Math.round((complete / denominator) * 100);
}

export function computeMissedCount(habits: Habit[], dateKeys: string[]): number {
  let missed = 0;
  for (const dateKey of dateKeys) {
    for (const habit of habits) {
      if ((habit.logsByDate[dateKey] ?? "empty") === "missed") missed++;
    }
  }
  return missed;
}

// A calendar day counts once toward "completed", regardless of how many habits
// were ticked that day — it counts iff the day itself classifies as "success"
// (>=50% of that day's logged habits complete), the same day-success rule used
// for streak calculation. Reuses `classifyDate`, not a second implementation.
export function computeCompletedCount(habits: Habit[], dateKeys: string[]): number {
  let completedDays = 0;
  for (const dateKey of dateKeys) {
    if (classifyDate(habits, dateKey) === "success") completedDays++;
  }
  return completedDays;
}

// Days with at least one log of any kind (complete/missed/rest/vacation) — how
// many days the user engaged with the app at all, as distinct from `completed`
// (successful days only).
export function computeDaysTracked(habits: Habit[], dateKeys: string[]): number {
  let tracked = 0;
  for (const dateKey of dateKeys) {
    if (classifyDate(habits, dateKey) !== "empty") tracked++;
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
