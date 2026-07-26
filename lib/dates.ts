export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ISO 8601 day-of-week: 1=Monday .. 7=Sunday. Matches Postgres's
// extract(isodow from date) exactly — must stay in sync, since habits'
// scheduled_days are stored using this same convention on both sides.
export function isoDayOfWeek(dateKey: string): number {
  const jsDay = parseDateKey(dateKey).getDay(); // 0=Sunday .. 6=Saturday
  return jsDay === 0 ? 7 : jsDay;
}

// Ascending list of date keys from `start` through `end`, inclusive.
export function dateKeyRange(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const stop = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor.getTime() <= stop.getTime()) {
    keys.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

// Date keys for the 1st of `year`/`month` (0-indexed) through `throughDay` of that same month.
export function monthDateKeys(year: number, month: number, throughDay: number): string[] {
  if (throughDay <= 0) return [];
  return dateKeyRange(new Date(year, month, 1), new Date(year, month, throughDay));
}

// "10m ago" / "3h ago" / "5d ago" style relative time for feed timestamps.
export function formatRelativeTime(isoDate: string, now: Date = new Date()): string {
  const elapsedMs = now.getTime() - new Date(isoDate).getTime();
  const minutes = Math.floor(elapsedMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
