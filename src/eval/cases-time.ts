import { resolveDates } from "../time/resolve.js";
import type { EvalCase } from "./cases-memory.js";
import { NOW, TZ } from "./helpers.js";

const MONDAY = new Date("2026-11-09T12:00:00.000Z");

export const timeCases: EvalCase[] = [
  { id: "01", name: "bare Monday is the most recent past Monday, not today", run: bareMonday },
  { id: "02", name: "on a Monday, bare Monday is the previous Monday", run: mondayOnMonday },
  { id: "03", name: "last Tuesday is that weekday in the previous calendar week", run: lastTuesday },
  { id: "04", name: "3 November stays this year and a future month rolls back", run: explicitDates },
  { id: "05", name: "since then uses the previous assistant timestamp", run: sinceThen },
  { id: "06", name: "since then with no history does not invent a date", run: sinceMissing },
  { id: "07", name: "since Monday is a weekday, not an empty since", run: sinceMonday },
  { id: "08", name: "today, yesterday, and an ISO date", run: todayYesterdayIso },
  { id: "09", name: "late night in Los Angeles is not the UTC date", run: pacificEdge },
  { id: "10", name: "one sentence can carry Monday, last Tuesday, this Tuesday, and next Tuesday", run: several },
];

function bareMonday() {
  const anchor = resolveDates("On Monday we shortlisted tools", NOW, TZ).find((item) => item.rule === "bare-weekday");
  expect(anchor?.date, "2026-11-09", "bare Monday");
}

function mondayOnMonday() {
  const anchor = resolveDates("Monday", MONDAY, TZ)[0];
  expect(anchor?.date, "2026-11-02", "Monday on a Monday");
  if (anchor?.date === "2026-11-09") throw new Error("bare weekday resolved to today");
}

function lastTuesday() {
  const anchor = resolveDates("Last Tuesday I asked about Postgres", NOW, TZ).find((item) => item.rule === "last-weekday");
  expect(anchor?.date, "2026-11-03", "last Tuesday");
}

function explicitDates() {
  const anchors = resolveDates("What did I ask on 3 November, and what about 3 December or 2024-05-01?", NOW, TZ);
  expect(dateFor(anchors, "explicit-date", "3 November"), "2026-11-03", "3 November");
  expect(dateFor(anchors, "explicit-date", "3 December"), "2025-12-03", "3 December");
  expect(dateFor(anchors, "iso-date", "2024-05-01"), "2024-05-01", "iso");
}

function sinceThen() {
  const anchor = resolveDates("Has pricing changed since then?", NOW, TZ, [
    { role: "assistant", timestamp: "2026-11-09T03:35:00.000Z" },
  ])[0];
  expect(anchor?.date, "2026-11-09", "since then");
  if (anchor?.rule !== "since-then") throw new Error(anchor?.rule ?? "missing rule");
}

function sinceMissing() {
  const anchor = resolveDates("Has pricing changed since then?", NOW, TZ)[0];
  if (anchor?.date !== null || anchor?.confidence !== "low") {
    throw new Error(`invented a since-then date: ${anchor?.date}`);
  }
}

function sinceMonday() {
  const anchors = resolveDates("Has pricing changed since Monday?", NOW, TZ);
  if (anchors.some((anchor) => anchor.rule === "since-then")) throw new Error("since Monday became since-then");
  expect(anchors.find((anchor) => anchor.rule === "bare-weekday")?.date, "2026-11-09", "since Monday");
}

function todayYesterdayIso() {
  const anchors = resolveDates("today, yesterday, and 2026-01-02", NOW, TZ);
  expect(dateFor(anchors, "today", "today"), "2026-11-11", "today");
  expect(dateFor(anchors, "yesterday", "yesterday"), "2026-11-10", "yesterday");
  expect(dateFor(anchors, "iso-date", "2026-01-02"), "2026-01-02", "iso in sentence");
}

function pacificEdge() {
  const late = new Date("2026-11-12T07:30:00.000Z");
  const local = resolveDates("today and Monday", late, "America/Los_Angeles");
  expect(dateFor(local, "today", "today"), "2026-11-11", "Los Angeles today");
  expect(dateFor(local, "bare-weekday", "Monday"), "2026-11-09", "Los Angeles Monday");
  const utc = resolveDates("today", late, "UTC");
  expect(utc[0]?.date, "2026-11-12", "UTC today");
}

function several() {
  const anchors = resolveDates("On Monday and last Tuesday, then this Tuesday and next Tuesday", NOW, TZ);
  expect(dateFor(anchors, "bare-weekday", "Monday"), "2026-11-09", "Monday");
  expect(dateFor(anchors, "last-weekday", "Tuesday"), "2026-11-03", "last Tuesday");
  expect(dateFor(anchors, "this-weekday", "Tuesday"), "2026-11-10", "this Tuesday");
  expect(dateFor(anchors, "next-weekday", "Tuesday"), "2026-11-17", "next Tuesday");
  if (anchors.length !== 4) throw new Error(`expected 4 anchors, got ${anchors.map((anchor) => anchor.phrase).join(" | ")}`);
}

function dateFor(anchors: ReturnType<typeof resolveDates>, rule: string, phraseIncludes: string): string | null | undefined {
  return anchors.find((anchor) => anchor.rule === rule && anchor.phrase.toLowerCase().includes(phraseIncludes.toLowerCase()))?.date;
}

function expect(actual: string | null | undefined, wanted: string, label: string) {
  if (actual !== wanted) throw new Error(`${label}: expected ${wanted}, got ${actual}`);
}
