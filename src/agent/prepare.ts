import { randomUUID } from "node:crypto";
import { buildContext } from "../context/build.js";
import { recall } from "../recall/recall.js";
import { resolveDates } from "../time/resolve.js";
import { localDateString } from "../time/zone.js";
import type { Store } from "../store/db.js";
import { baselineDate, isChangeQuestion } from "./budget.js";

const RECENT = 8;

export function prepareTurn(
  store: Store,
  input: { userId: string; text: string; timeZone: string; now: Date; clockNote?: string },
) {
  const history = store.messages(input.userId);
  const current = history.at(-1);
  const anchors = resolveDates(
    input.text,
    input.now,
    input.timeZone,
    history.map((message) => ({ role: message.role, timestamp: message.timestamp })),
  );
  const bundle = recall(
    store,
    input.userId,
    anchors,
    input.text,
    input.timeZone,
    current?.role === "user" && current.content === input.text ? [current.id] : [],
  );
  const recalledIds = new Set([
    ...bundle.dated.flatMap((day) => day.messages.map((message) => message.id)),
    ...bundle.topicHits.map((hit) => hit.message.id),
  ]);
  const question = input.text.toLowerCase();
  const claims = store
    .claims(input.userId)
    .filter(
      (claim) => recalledIds.has(claim.messageId) || question.includes(claim.entity.toLowerCase()),
    )
    .slice(0, 24);
  const recent = history.slice(-RECENT);
  const recentIds = new Set(recent.map((message) => message.id));
  const verbatimIds = new Set(bundle.dated.flatMap((day) => day.messages.map((message) => message.id)));
  const older = history.filter((message) => !recentIds.has(message.id) && !verbatimIds.has(message.id));
  const built = buildContext({
    now: input.now,
    timeZone: input.timeZone,
    anchors,
    recall: bundle,
    recent,
    older,
    digests: store.digests(input.userId),
    claims,
    clockNote: input.clockNote,
  });
  return {
    anchors,
    recall: bundle,
    claims,
    system: built.system,
    messages: built.messages,
    changeCheck: isChangeQuestion(input.text),
    baseline: baselineDate(anchors),
    localDate: localDateString(input.now, input.timeZone),
  };
}

export function newId(): string {
  return randomUUID();
}
