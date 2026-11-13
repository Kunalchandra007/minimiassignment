import * as chrono from "chrono-node";
import {
  WEEKDAYS,
  addDays,
  compareYmd,
  isValidYmd,
  mostRecentPastWeekday,
  nextWeekday,
  parseYmd,
  weekdayInPreviousCalendarWeek,
  weekdayInThisCalendarWeek,
  ymdString,
  type Ymd,
} from "./calendar.js";
import { localDateString, zonedParts } from "./zone.js";
import type { DateAnchor } from "../types.js";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const WEEK_ALT = WEEKDAYS.join("|");

export interface HistoryPoint {
  role: "user" | "assistant";
  timestamp: string;
}

interface Span {
  start: number;
  end: number;
  anchor: DateAnchor;
}

function occupied(spans: Span[], start: number, end: number): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}

function push(spans: Span[], start: number, end: number, anchor: DateAnchor) {
  if (start < 0 || occupied(spans, start, end)) return;
  spans.push({ start, end, anchor });
}

function explicitDate(today: Ymd, month: number, day: number, year?: number): Ymd | null {
  let y = year ?? today.y;
  const candidate = { y, m: month, d: day };
  if (!isValidYmd(candidate)) return null;
  if (year === undefined && compareYmd(candidate, today) > 0) {
    y -= 1;
    if (!isValidYmd({ y, m: month, d: day })) return null;
  }
  return { y, m: month, d: day };
}

/**
 * Resolves date phrases against the user's wall clock. Week rules are ours;
 * chrono-node covers leftovers such as "a week ago".
 */
export function resolveDates(
  text: string,
  now: Date,
  timeZone: string,
  history: HistoryPoint[] = [],
): DateAnchor[] {
  const today = zonedParts(now, timeZone);
  const todayYmd = { y: today.y, m: today.m, d: today.d };
  const spans: Span[] = [];

  const dated = (phrase: string, ymd: Ymd, rule: string): DateAnchor => ({
    phrase,
    date: ymdString(ymd),
    rule,
    confidence: "high",
  });

  for (const match of text.matchAll(new RegExp(`\\b(last|this|next)\\s+(${WEEK_ALT})\\b`, "gi"))) {
    const word = match[1].toLowerCase();
    const day = WEEKDAYS.indexOf(match[2].toLowerCase() as (typeof WEEKDAYS)[number]);
    const ymd =
      word === "last"
        ? weekdayInPreviousCalendarWeek(todayYmd, day)
        : word === "this"
          ? weekdayInThisCalendarWeek(todayYmd, day)
          : nextWeekday(todayYmd, day);
    const rule = word === "last" ? "last-weekday" : word === "this" ? "this-weekday" : "next-weekday";
    push(spans, match.index ?? 0, (match.index ?? 0) + match[0].length, dated(match[0], ymd, rule));
  }

  for (const match of text.matchAll(/\b(today|yesterday|tomorrow)\b/gi)) {
    const word = match[0].toLowerCase();
    const ymd = word === "today" ? todayYmd : addDays(todayYmd, word === "yesterday" ? -1 : 1);
    push(spans, match.index ?? 0, (match.index ?? 0) + match[0].length, dated(match[0], ymd, word));
  }

  const dayMonth = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${MONTH_ALT})(?:\\s*,?\\s*(\\d{4}))?\\b`,
    "gi",
  );
  const monthDay = new RegExp(
    `\\b(${MONTH_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`,
    "gi",
  );
  for (const match of text.matchAll(dayMonth)) {
    const ymd = explicitDate(todayYmd, MONTHS[match[2].toLowerCase()], Number(match[1]), match[3] ? Number(match[3]) : undefined);
    if (!ymd) continue;
    push(spans, match.index ?? 0, (match.index ?? 0) + match[0].length, dated(match[0], ymd, "explicit-date"));
  }
  for (const match of text.matchAll(monthDay)) {
    const ymd = explicitDate(todayYmd, MONTHS[match[1].toLowerCase()], Number(match[2]), match[3] ? Number(match[3]) : undefined);
    if (!ymd) continue;
    push(spans, match.index ?? 0, (match.index ?? 0) + match[0].length, dated(match[0], ymd, "explicit-date"));
  }
  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const ymd = { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
    if (!isValidYmd(ymd)) continue;
    push(spans, match.index ?? 0, (match.index ?? 0) + match[0].length, dated(match[0], ymd, "iso-date"));
  }
  for (const match of text.matchAll(new RegExp(`\\b(${WEEK_ALT})\\b`, "gi"))) {
    const day = WEEKDAYS.indexOf(match[1].toLowerCase() as (typeof WEEKDAYS)[number]);
    push(
      spans,
      match.index ?? 0,
      (match.index ?? 0) + match[0].length,
      dated(match[0], mostRecentPastWeekday(todayYmd, day), "bare-weekday"),
    );
  }

  addSince(text, spans, history, timeZone);
  addChrono(text, spans, now, timeZone);
  return annotateThread(spans.map((span) => span.anchor), history, timeZone);
}

function addSince(text: string, spans: Span[], history: HistoryPoint[], timeZone: string) {
  for (const match of text.matchAll(/\b(since then|since that|after that)\b/gi)) {
    push(spans, match.index ?? 0, (match.index ?? 0) + match[0].length, sinceAnchor(match[0], history, timeZone));
  }
  for (const match of text.matchAll(/\bsince\b/gi)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (occupied(spans, start, end)) continue;
    const nextDate = spans
      .filter((span) => span.start >= end && span.start <= end + 24 && span.anchor.date)
      .sort((a, b) => a.start - b.start)[0];
    if (nextDate) continue;
    push(spans, start, end, sinceAnchor(match[0], history, timeZone));
  }
}

function sinceAnchor(phrase: string, history: HistoryPoint[], timeZone: string): DateAnchor {
  const prior = [...history].reverse().find((item) => item.role === "assistant");
  if (!prior) {
    return {
      phrase,
      date: null,
      rule: "since-then",
      confidence: "low",
      note: "No earlier assistant answer in this thread.",
    };
  }
  return {
    phrase,
    date: localDateString(new Date(prior.timestamp), timeZone),
    rule: "since-then",
    confidence: "high",
    note: `Baseline is the assistant answer at ${prior.timestamp}.`,
  };
}

function addChrono(text: string, spans: Span[], now: Date, timeZone: string) {
  const chars = text.split("");
  for (const span of spans) {
    for (let i = span.start; i < span.end && i < chars.length; i++) {
      if (!/\s/.test(chars[i])) chars[i] = " ";
    }
  }
  const wall = zonedParts(now, timeZone);
  const ref = new Date(wall.y, wall.m - 1, wall.d, wall.hour, wall.minute, wall.second);
  for (const result of chrono.parse(chars.join(""), ref, { forwardDate: false })) {
    const start = result.index;
    const end = start + result.text.length;
    if (occupied(spans, start, end)) continue;
    const date = result.start?.date();
    if (!date) continue;
    const ymd = { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
    if (compareYmd(ymd, { y: wall.y, m: wall.m, d: wall.d }) > 0) continue;
    push(spans, start, end, {
      phrase: result.text,
      date: ymdString(ymd),
      rule: "chrono",
      confidence: "medium",
    });
  }
}

function annotateThread(anchors: DateAnchor[], history: HistoryPoint[], timeZone: string): DateAnchor[] {
  const dates = history.map((item) => localDateString(new Date(item.timestamp), timeZone));
  const threadRules = new Set(["bare-weekday", "last-weekday", "this-weekday"]);
  return anchors.map((anchor) => {
    if (!anchor.date || !threadRules.has(anchor.rule)) return anchor;
    if (dates.includes(anchor.date)) return anchor;
    const same = dates.filter((date) => {
      if (date === anchor.date) return false;
      const target = parseYmd(anchor.date as string);
      return weekdayIndexSafe(date) === weekdayIndexSafe(ymdString(target));
    });
    if (same.length === 0) return anchor;
    const other = [...same].sort().at(-1) as string;
    const note = `No messages on ${anchor.date}. The thread also has ${other}. Say both dates.`;
    return { ...anchor, note: anchor.note ? `${anchor.note} ${note}` : note };
  });
}

function weekdayIndexSafe(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
