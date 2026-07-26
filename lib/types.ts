export type HabitStatus = "complete" | "missed" | "rest" | "vacation" | "empty";

export const HABIT_CATEGORIES = ["ML / Career", "Fitness / Bulk", "Sleep / Recovery", "Discipline", "Business"] as const;

export type HabitCategory = (typeof HABIT_CATEGORIES)[number];

// ISO 8601 day-of-week values (1=Monday .. 7=Sunday), Monday-first to match
// the grid/heatmap's existing weekday label convention elsewhere in the app.
export const ALL_SCHEDULED_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const SCHEDULE_DAY_LABELS: Record<number, string> = { 1: "M", 2: "T", 3: "W", 4: "T", 5: "F", 6: "S", 7: "S" };

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
  // ISO 8601 day-of-week values (1=Mon..7=Sun) this habit applies to. A day
  // not in this list is never scheduled — not counted anywhere, non-interactive
  // in the grid. Defaults to all 7 days ("Daily") for existing habits.
  scheduledDays: number[];
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
