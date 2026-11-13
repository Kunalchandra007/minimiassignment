import { RULES } from "../agent/prompt.js";
import { formatStamp, weekdayName } from "../time/zone.js";
import type { Claim, DateAnchor, DayDigest, Role, StoredMessage } from "../types.js";
import type { RecallBundle } from "../recall/recall.js";

export interface BuiltContext {
  system: string;
  messages: Array<{ role: Role; content: string }>;
}

export function buildContext(input: {
  now: Date;
  timeZone: string;
  anchors: DateAnchor[];
  recall: RecallBundle;
  recent: StoredMessage[];
  older: StoredMessage[];
  digests: DayDigest[];
  claims: Claim[];
  clockNote?: string;
}): BuiltContext {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: input.timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(input.now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: input.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(input.now);

  const lines = [
    RULES,
    "",
    "NOW",
    `Date: ${date}`,
    `Time: ${time}`,
    `Timezone: ${input.timeZone}`,
    `Weekday: ${weekdayName(input.now, input.timeZone)}`,
    input.clockNote ?? "",
    "",
    "ANCHORS",
    input.anchors.length
      ? input.anchors
          .map((anchor) => {
            const when = anchor.date ?? "unresolved";
            const note = anchor.note ? ` ${anchor.note}` : "";
            return `- "${anchor.phrase}" → ${when} (${anchor.rule}, ${anchor.confidence}).${note}`;
          })
          .join("\n")
      : "- none",
    "",
    "NO RECORD",
    noRecordLines(input),
    "",
    "RECALLED VERBATIM",
    verbatim(input.recall, input.timeZone),
    "",
    "CLAIMS",
    input.claims.length
      ? input.claims
          .map(
            (claim) =>
              `- ${claim.entity} | ${claim.attribute} | ${claim.value} | as of ${claim.asOf} | ${claim.sourceUrl ?? "no url"}`,
          )
          .join("\n")
      : "- No ledger claims for this question. Use the verbatim answer as the baseline if there is one.",
    "",
    "TOPIC HITS",
    input.recall.topicHits.length
      ? input.recall.topicHits
          .map((hit) => `[${formatStamp(hit.message.timestamp, input.timeZone)}] ${hit.message.role}: ${clip(hit.message.content)}`)
          .join("\n")
      : "- none",
    "",
    "OLDER LOG",
    olderLog(input.older, input.digests, input.timeZone),
  ];

  return {
    system: lines.filter((line) => line !== "").join("\n"),
    messages: input.recent.map((message) => ({ role: message.role, content: message.content })),
  };
}

function noRecordLines(input: { anchors: DateAnchor[]; recall: RecallBundle }): string {
  const lines: string[] = [];
  for (const anchor of input.anchors) {
    if (!anchor.date) lines.push(`NO RECORD FOUND for "${anchor.phrase}". ${anchor.note ?? ""}`.trim());
  }
  for (const day of input.recall.dated) {
    if (day.missing) lines.push(`NO RECORD FOUND for ${day.anchor.date} ("${day.anchor.phrase}").`);
  }
  return lines.length ? lines.join("\n") : "- none";
}

function verbatim(recall: RecallBundle, timeZone: string): string {
  const messages = recall.dated.flatMap((day) => day.messages);
  if (!messages.length) return "- none";
  return messages
    .map((message) => `[${formatStamp(message.timestamp, timeZone)} ${timeZone}] ${message.role}: ${message.content}`)
    .join("\n");
}

function olderLog(older: StoredMessage[], digests: DayDigest[], timeZone: string): string {
  const digestLines = digests.map((digest) => `${digest.localDate} digest: ${clip(digest.summary)} [${digest.topics.join(", ")}]`);
  const messageLines = older.slice(-40).map((message) => {
    return `${formatStamp(message.timestamp, timeZone)} ${message.role}: ${clip(message.content)}`;
  });
  const lines = [...digestLines, ...messageLines];
  return lines.length ? lines.join("\n") : "- none";
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 180 ? `${flat.slice(0, 177)}...` : flat;
}
