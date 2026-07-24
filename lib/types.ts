export type HabitStatus = "complete" | "missed" | "rest" | "vacation" | "empty";

export const HABIT_CATEGORIES = ["ML / Career", "Fitness / Bulk", "Sleep / Recovery", "Discipline", "Business"] as const;

export type HabitCategory = (typeof HABIT_CATEGORIES)[number];

export interface Habit {
  id: string;
  name: string;
  subtitle?: string;
  category: string;
  icon: string;
  // Every logged day for this habit, keyed by "YYYY-MM-DD". A missing key means
  // no log row exists for that day (rendered/counted as "empty", never "missed").
  logsByDate: Record<string, HabitStatus>;
  isCore: boolean;
  orderIndex: number;
}

export interface FeedItem {
  id: string;
  name: string;
  initials: string;
  verb: string;
  target: string;
  time: string;
  badge: string;
  type: "complete" | "rest" | "vacation";
}
