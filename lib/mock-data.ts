import { FeedItem } from "./types";

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
