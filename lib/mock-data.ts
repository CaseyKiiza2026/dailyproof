import { FeedItem, Habit, HabitStatus } from "./types";

export const monthDays = Array.from({ length: 31 }, (_, index) => index + 1);

const p = (...values: HabitStatus[]) => values;

export const initialHabits: Habit[] = [
  {
    id: "ml",
    name: "45 min ML",
    subtitle: "minimum",
    category: "ML / Career",
    icon: "◉",
    statuses: p("complete", "complete", "complete", "complete", "complete", "complete", "complete", "rest", "complete", "complete", "complete", "empty", "empty", "empty")
  },
  {
    id: "code",
    name: "Code",
    subtitle: "something",
    category: "ML / Career",
    icon: "</>",
    statuses: p("complete", "complete", "complete", "complete", "complete", "complete", "complete", "complete", "complete", "missed", "complete", "vacation", "empty", "empty")
  },
  {
    id: "protein",
    name: "Protein",
    subtitle: "target",
    category: "Fitness / Bulk",
    icon: "◌",
    statuses: p("complete", "complete", "complete", "complete", "complete", "rest", "complete", "complete", "complete", "complete", "complete", "empty", "empty", "rest")
  },
  {
    id: "calories",
    name: "Calories",
    subtitle: "target",
    category: "Fitness / Bulk",
    icon: "♨",
    statuses: p("missed", "complete", "complete", "complete", "complete", "complete", "complete", "rest", "complete", "complete", "complete", "empty", "empty", "complete")
  },
  {
    id: "gym",
    name: "Gym or",
    subtitle: "recovery",
    category: "Fitness / Bulk",
    icon: "↔",
    statuses: p("complete", "complete", "complete", "rest", "complete", "complete", "complete", "vacation", "complete", "rest", "complete", "empty", "empty", "empty")
  },
  {
    id: "water",
    name: "Water",
    subtitle: "2.5L",
    category: "Sleep / Recovery",
    icon: "◇",
    statuses: p("complete", "complete", "complete", "complete", "complete", "complete", "complete", "complete", "complete", "complete", "complete", "complete", "empty", "empty")
  },
  {
    id: "social",
    name: "No social",
    subtitle: "before 5 PM",
    category: "Discipline",
    icon: "⊘",
    statuses: p("complete", "complete", "complete", "complete", "complete", "missed", "complete", "complete", "complete", "missed", "complete", "rest", "empty", "empty")
  }
];

export const feedItems: FeedItem[] = [
  { id: "1", name: "Jethro", initials: "JJ", verb: "completed", target: "45 min ML minimum", time: "10m ago", badge: "21 day streak", type: "complete" },
  { id: "2", name: "Sarah", initials: "SA", verb: "hit", target: "protein target", time: "23m ago", badge: "7 day streak", type: "complete" },
  { id: "3", name: "David", initials: "DK", verb: "marked", target: "recovery day", time: "1h ago", badge: "Recovery", type: "rest" },
  { id: "4", name: "Maya", initials: "MO", verb: "completed", target: "No social before 5 PM", time: "2h ago", badge: "12 day streak", type: "complete" }
];

export const friendRows = [
  { name: "Sarah Chen", handle: "@sarah", score: 91, streak: 18, initials: "SC" },
  { name: "David Kim", handle: "@davidk", score: 86, streak: 16, initials: "DK" },
  { name: "Maya Ortiz", handle: "@maya", score: 82, streak: 12, initials: "MO" }
];
