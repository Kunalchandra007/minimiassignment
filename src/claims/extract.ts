import { randomUUID } from "node:crypto";
import { generateObject } from "ai";
import { z } from "zod";
import { languageModel } from "../agent/model.js";
import { config } from "../config.js";
import type { Store } from "../store/db.js";

const schema = z.object({
  claims: z.array(
    z.object({
      entity: z.string(),
      attribute: z.string(),
      value: z.string(),
      asOf: z.string(),
      sourceUrl: z.string().nullable(),
    }),
  ),
  summary: z.string(),
  topics: z.array(z.string()),
});

export function scheduleExtraction(
  store: Store,
  input: { userId: string; messageId: string; localDate: string; userText: string; answer: string },
): void {
  if (!config.geminiKey) return;
  void extract(store, input).catch((error) => {
    console.log(JSON.stringify({ level: "extract", error: error instanceof Error ? error.message : "failed" }));
  });
}

async function extract(store: Store, input: { userId: string; messageId: string; localDate: string; userText: string; answer: string }) {
  const previous = store.digests(input.userId).find((digest) => digest.localDate === input.localDate);
  const { object } = await generateObject({
    model: languageModel(config.fastModel),
    schema,
    maxRetries: 1,
    prompt: [
      "Extract checkable claims from the assistant answer. Skip greetings, opinions, and anything not stated as fact.",
      "attribute is one of: price, plan, feature, version, status.",
      "asOf is YYYY-MM-DD. sourceUrl is a URL from the answer, or null.",
      "summary is one or two sentences covering the whole local day, merging the previous summary.",
      "topics is 1 to 6 short noun phrases.",
      `Local date: ${input.localDate}`,
      previous ? `Previous summary: ${previous.summary}` : "Previous summary: none",
      `User: ${input.userText}`,
      `Assistant: ${input.answer}`,
    ].join("\n"),
  });

  const claims = object.claims
    .filter((claim) => claim.entity.trim() && claim.value.trim())
    .slice(0, 12)
    .map((claim) => ({
      id: randomUUID(),
      userId: input.userId,
      messageId: input.messageId,
      entity: claim.entity.trim().slice(0, 80),
      attribute: claim.attribute.trim().slice(0, 40),
      value: claim.value.trim().slice(0, 180),
      asOf: /^\d{4}-\d{2}-\d{2}$/.test(claim.asOf) ? claim.asOf : input.localDate,
      sourceUrl: claim.sourceUrl,
    }));
  if (claims.length) store.addClaims(claims);
  store.upsertDigest({
    userId: input.userId,
    localDate: input.localDate,
    summary: object.summary.trim().slice(0, 500) || input.answer.slice(0, 180),
    topics: object.topics.map((topic) => topic.trim()).filter(Boolean).slice(0, 6),
  });
}
