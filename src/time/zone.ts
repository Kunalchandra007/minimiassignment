import { addDays, pad, type Ymd, ymdString } from "./calendar.js";

export interface ZonedParts extends Ymd {
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const bag: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) bag[part.type] = part.value;
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    y: Number(bag.year),
    m: Number(bag.month),
    d: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const wallAsUtc = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second);
  return wallAsUtc - instant.getTime();
}

export function zonedTimeToUtc(
  y: number,
  m: number,
  d: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const desired = Date.UTC(y, m - 1, d, hour, minute, second);
  let instant = new Date(desired);
  for (let i = 0; i < 3; i++) instant = new Date(desired - offsetMs(instant, timeZone));
  return instant;
}

export function localDayUtcRange(date: string, timeZone: string): { start: string; end: string } {
  const [y, m, d] = date.split("-").map(Number);
  const start = zonedTimeToUtc(y, m, d, 0, 0, 0, timeZone);
  const next = addDays({ y, m, d }, 1);
  const end = zonedTimeToUtc(next.y, next.m, next.d, 0, 0, 0, timeZone);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function localDateString(instant: Date, timeZone: string): string {
  return ymdString(zonedParts(instant, timeZone));
}

export function formatStamp(iso: string, timeZone: string): string {
  const p = zonedParts(new Date(iso), timeZone);
  return `${ymdString(p)} ${pad(p.hour)}:${pad(p.minute)}`;
}

export function weekdayName(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(instant);
}
