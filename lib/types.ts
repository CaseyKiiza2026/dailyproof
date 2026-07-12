export type HabitStatus = "complete" | "missed" | "rest" | "vacation" | "empty";

export interface Habit {
  id: string;
  name: string;
  subtitle?: string;
  category: string;
  icon: string;
  statuses: HabitStatus[];
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
