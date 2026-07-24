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
