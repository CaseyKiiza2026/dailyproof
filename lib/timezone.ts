import { parseDateKey } from "@/lib/dates";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

// Instants are UTC. Calendar keys are always derived in the persisted zone.
export function dateKeyInTimeZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Calendar arithmetic, not elapsed 24-hour arithmetic (DST days vary in length).
export function shiftDateKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function calendarDays(instant: Date, timeZone: string) {
  const today = dateKeyInTimeZone(instant, timeZone);
  return { today, yesterday: shiftDateKey(today, -1), tomorrow: shiftDateKey(today, 1) };
}

// A civil-date adapter for existing calendar components. Never use this Date
// as an instant or send it to the database; only its calendar fields matter.
export function calendarDate(instant: Date, timeZone: string): Date {
  return parseDateKey(dateKeyInTimeZone(instant, timeZone));
}
