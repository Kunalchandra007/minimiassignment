export interface Ymd {
  y: number;
  m: number;
  d: number;
}

export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function ymdString(p: Ymd): string {
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function addDays(p: Ymd, days: number): Ymd {
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function weekdayIndex(p: Ymd): number {
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

export function compareYmd(a: Ymd, b: Ymd): number {
  return ymdString(a).localeCompare(ymdString(b));
}

export function isValidYmd(p: Ymd): boolean {
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  return dt.getUTCFullYear() === p.y && dt.getUTCMonth() === p.m - 1 && dt.getUTCDate() === p.d;
}

/** Most recent past weekday. Never today. */
export function mostRecentPastWeekday(today: Ymd, target: number): Ymd {
  const current = weekdayIndex(today);
  let delta = (current - target + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(today, -delta);
}

/** That weekday inside the previous Monday–Sunday week. */
export function weekdayInPreviousCalendarWeek(today: Ymd, target: number): Ymd {
  const sinceMonday = (weekdayIndex(today) + 6) % 7;
  const thisMonday = addDays(today, -sinceMonday);
  const prevMonday = addDays(thisMonday, -7);
  const fromMonday = (target + 6) % 7;
  return addDays(prevMonday, fromMonday);
}

export function weekdayInThisCalendarWeek(today: Ymd, target: number): Ymd {
  const sinceMonday = (weekdayIndex(today) + 6) % 7;
  const thisMonday = addDays(today, -sinceMonday);
  return addDays(thisMonday, (target + 6) % 7);
}

/** Next occurrence strictly after today. */
export function nextWeekday(today: Ymd, target: number): Ymd {
  const current = weekdayIndex(today);
  let delta = (target - current + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(today, delta);
}

export function parseYmd(value: string): Ymd {
  const [y, m, d] = value.split("-").map(Number);
  return { y, m, d };
}
