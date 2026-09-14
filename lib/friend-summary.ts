import { DayActivity, HabitStatus } from "@/lib/types";

export interface FriendSummaryResult {
  username: string;
  log_date: string;
  today_key: string;
  complete_count: number;
  total_count: number;
  completion: number;
  streak: number;
  details_visible: boolean;
  missed_count?: number;
  rest_count?: number;
  vacation_count?: number;
  empty_count?: number;
  statuses?: { habit_name: string; status: HabitStatus }[];
}

export function dayActivity(summary: FriendSummaryResult): DayActivity {
  return {
    logDate: summary.log_date, completeCount: summary.complete_count,
    totalCount: summary.total_count, completion: summary.completion, detailsVisible: summary.details_visible,
    missedCount: summary.missed_count ?? 0, restCount: summary.rest_count ?? 0,
    vacationCount: summary.vacation_count ?? 0, emptyCount: summary.empty_count ?? 0,
    statuses: (summary.statuses ?? []).map((s) => ({ habitName: s.habit_name, status: s.status }))
  };
}
