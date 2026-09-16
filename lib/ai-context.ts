import { CalendarData } from "@/lib/calendar";
import {
  dailyProgress,
  habitStatusOnDay,
  isTaskOnDay,
  periodProgress,
} from "@/lib/daily-progress";
import { HabitStatus } from "@/lib/types";
import { dateKeyInTimeZone, shiftDateKey } from "@/lib/timezone";

export interface HabitContextLog {
  habit_id: string;
  log_date: string;
  status: HabitStatus;
}

export function activityContext(
  calendar: CalendarData,
  logs: HabitContextLog[],
  today: string,
  timeZone: string,
) {
  const habits = calendar.habits.map((h) => ({
    ...h,
    scheduledDays: h.scheduled_days,
    logsByDate: Object.fromEntries(
      logs
        .filter((l) => l.habit_id === h.id)
        .map((l) => [l.log_date, l.status]),
    ),
  }));
  function dayWork(day: string) {
    const dayHabits = habits.map((h) => ({
      id: h.id,
      name: h.name,
      scheduled_days: h.scheduled_days,
      scheduled_time: h.scheduled_time,
      duration_minutes: h.duration_minutes,
      status: habitStatusOnDay(h, day),
    }));
    const tasks = calendar.tasks.filter((t) => isTaskOnDay(t, day, timeZone));
    return {
      day,
      habits: dayHabits,
      tasks,
      incompleteHabits: dayHabits.filter(
        (h) => h.status === "empty" || h.status === "missed",
      ),
      incompleteTasks: tasks.filter((t) => t.status === "pending"),
      progress: dailyProgress(habits, calendar.tasks, day, timeZone),
    };
  }
  const weekday = new Date(`${today}T12:00Z`).getUTCDay() || 7;
  const start = shiftDateKey(today, 1 - weekday);
  const days = Array.from({ length: weekday }, (_, i) =>
    shiftDateKey(start, i),
  );
  return {
    todayWork: {
      today,
      timeZone,
      ...dayWork(today),
      commitments: calendar.commitments.filter(
        (c) =>
          dateKeyInTimeZone(new Date(c.start_at), timeZone) <= today &&
          dateKeyInTimeZone(new Date(c.end_at), timeZone) >= today,
      ),
    },
    week: {
      start,
      end: today,
      timeZone,
      ...periodProgress(habits, calendar.tasks, days, timeZone),
      days: days.map(dayWork),
    },
  };
}
