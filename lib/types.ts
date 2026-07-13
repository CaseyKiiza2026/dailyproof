export type HabitStatus = "complete" | "missed" | "rest" | "vacation" | "empty";

export const HABIT_CATEGORIES = ["ML / Career", "Fitness / Bulk", "Sleep / Recovery", "Discipline", "Business"] as const;

export type HabitCategory = (typeof HABIT_CATEGORIES)[number];

export interface Habit {
  id: string;
  name: string;
  subtitle?: string;
  category: string;
  icon: string;
  statuses: HabitStatus[];
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
