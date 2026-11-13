import { bm25 } from "./bm25.js";
import { localDayUtcRange } from "../time/zone.js";
import type { DateAnchor, StoredMessage } from "../types.js";
import type { Store } from "../store/db.js";

export interface DatedRecall {
  anchor: DateAnchor;
  messages: StoredMessage[];
  missing: boolean;
}

export interface TopicHit {
  message: StoredMessage;
  score: number;
}

export interface RecallBundle {
  dated: DatedRecall[];
  topicHits: TopicHit[];
}

export function recall(
  store: Store,
  userId: string,
  anchors: DateAnchor[],
  userText: string,
  timeZone: string,
  excludeIds: string[] = [],
): RecallBundle {
  const skip = new Set(excludeIds);
  const dated: DatedRecall[] = anchors
    .filter((anchor) => anchor.date)
    .map((anchor) => {
      const range = localDayUtcRange(anchor.date as string, timeZone);
      const messages = store.messagesInRange(userId, range.start, range.end).filter((message) => !skip.has(message.id));
      return { anchor, messages, missing: messages.length === 0 };
    });

  const seen = new Set(dated.flatMap((day) => day.messages.map((message) => message.id)));
  const corpus = store.messages(userId).filter((message) => !skip.has(message.id)).slice(-500);
  const ranked = bm25(
    corpus.map((message) => ({ id: message.id, text: message.content })),
    userText,
    8,
  );
  const byId = new Map(corpus.map((message) => [message.id, message]));
  const topicHits: TopicHit[] = [];
  for (const hit of ranked) {
    if (seen.has(hit.id)) continue;
    const message = byId.get(hit.id);
    if (!message) continue;
    topicHits.push({ message, score: hit.score });
    if (topicHits.length === 5) break;
  }

  for (const digest of store.digests(userId)) {
    const blob = `${digest.summary} ${digest.topics.join(" ")}`;
    if (!bm25([{ id: digest.localDate, text: blob }], userText, 1).length) continue;
    if (dated.some((day) => day.anchor.date === digest.localDate)) continue;
    const range = localDayUtcRange(digest.localDate, timeZone);
    for (const message of store.messagesInRange(userId, range.start, range.end)) {
      if (seen.has(message.id) || topicHits.some((hit) => hit.message.id === message.id)) continue;
      topicHits.push({ message, score: 0.01 });
      seen.add(message.id);
    }
  }

  return { dated, topicHits: topicHits.slice(0, 5) };
}
