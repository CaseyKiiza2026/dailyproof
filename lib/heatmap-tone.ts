import { Habit } from "@/lib/types";
import { classifyDate, completionRatio } from "@/lib/stats";

export type HeatmapTone = "empty" | "success-1" | "success-2" | "success-3" | "success-4" | "fail" | "rest" | "vacation";

export const TONE_CLASS: Record<HeatmapTone, string> = {
  empty: "bg-white/[0.05]",
  "success-1": "bg-emerald-950",
  "success-2": "bg-emerald-800",
  "success-3": "bg-emerald-600",
  "success-4": "bg-proof-green",
  fail: "bg-proof-red/75",
  rest: "bg-proof-amber/80",
  vacation: "bg-proof-violet/75"
};

export function successTone(ratio: number): HeatmapTone {
  if (ratio >= 1) return "success-4";
  if (ratio >= 0.8) return "success-3";
  if (ratio >= 0.65) return "success-2";
  return "success-1";
}

// The single tone-classification path for a given day, shared by every heatmap
// in the app (Year page, landing hero) so a day never renders a different color
// in two places.
export function dayTone(habits: Habit[], dateKey: string, isFuture = false): HeatmapTone {
  if (isFuture) return "empty";
  const type = classifyDate(habits, dateKey);
  if (type === "success") return successTone(completionRatio(habits, dateKey));
  if (type === "fail") return "fail";
  if (type === "rest") return "rest";
  if (type === "vacation") return "vacation";
  return "empty";
}
