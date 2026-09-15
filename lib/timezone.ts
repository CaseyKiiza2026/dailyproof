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

export function localDateTime(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

// Resolve a wall-clock entry in the saved zone. Reject DST gaps and ambiguous
// repeated times instead of silently scheduling at a different instant.
export function localDateTimeToUtc(value: string, timeZone: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !isValidTimeZone(timeZone)) throw new Error("Enter a valid date and time.");
  const nominal = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(nominal)) throw new Error("Enter a valid date and time.");
  const matches = new Set<string>();
  for (const delta of [-36, -12, 0, 12, 36]) {
    const probe = nominal + delta * 3600000;
    const offset = Date.parse(`${localDateTime(new Date(probe).toISOString(), timeZone)}:00Z`) - probe;
    const candidate = new Date(nominal - offset).toISOString();
    if (localDateTime(candidate, timeZone) === value) matches.add(candidate);
  }
  if (matches.size !== 1) throw new Error(matches.size ? "This time occurs twice during daylight saving. Choose a time outside the repeated hour." : "This local time does not exist. Choose another time.");
  return [...matches][0];
}
