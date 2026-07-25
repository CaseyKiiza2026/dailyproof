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

export type FriendshipStatus = "pending" | "accepted" | "declined";

export interface FriendProfile {
  id: string;
  username: string;
}

export interface Friendship {
  id: string;
  status: FriendshipStatus;
  requesterId: string;
  addresseeId: string;
  createdAt: string;
  otherUser: FriendProfile;
  // Whether the current user is the one who sent this request — determines
  // whether they see Accept/Decline (addressee) or a "Pending" label (requester).
  isRequester: boolean;
}

export type FeedEventType = "log" | "milestone";

export const STREAK_TIERS = ["base", "spark", "ember", "flame", "blaze", "inferno", "legend", "mythic"] as const;
export type StreakTier = (typeof STREAK_TIERS)[number];

export interface FeedEvent {
  id: string;
  userId: string;
  username: string;
  eventType: FeedEventType;
  habitId: string | null;
  habitName: string | null;
  status: "complete" | "missed" | null;
  loggedLate: boolean | null;
  tierName: StreakTier | null;
  logDate: string | null;
  createdAt: string;
}

export interface HabitStatusEntry {
  habitName: string;
  status: HabitStatus;
}

// One grouped card per (user, calendar day) — current state via
// get_friend_day_summary, never raw per-toggle history.
export interface DailySummary {
  userId: string;
  username: string;
  logDate: string;
  completeCount: number;
  missedCount: number;
  restCount: number;
  vacationCount: number;
  emptyCount: number;
  statuses: HabitStatusEntry[];
  streak: number;
  lastActivityAt: string;
}

// One day's worth of named habit statuses + counts — used by the "View
// activity" 7-day history, fetched on demand per day via get_friend_day_summary.
export interface DayActivity {
  logDate: string;
  completeCount: number;
  missedCount: number;
  restCount: number;
  vacationCount: number;
  emptyCount: number;
  statuses: HabitStatusEntry[];
}
