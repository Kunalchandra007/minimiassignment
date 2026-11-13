import { streamText, stepCountIs } from "ai";
import { config } from "../config.js";
import type { Store } from "../store/db.js";
import { scheduleExtraction } from "../claims/extract.js";
import { writeTrace, type TurnTrace } from "../trace/log.js";
import { MAX_MODEL_STEPS } from "./budget.js";
import { newId, prepareTurn } from "./prepare.js";
import { languageModel } from "./model.js";
import { createWebSearchTool, type SearchRun } from "./tools.js";
import type { SearchDeps } from "../search/tavily.js";

export async function runChat(options: {
  store: Store;
  userId: string;
  text: string;
  timeZone: string;
  clientNow?: string;
  now?: Date;
  signal?: AbortSignal;
  searchDeps?: SearchDeps;
  emit: (event: string, data: unknown) => void;
}): Promise<void> {
  const started = Date.now();
  options.emit("ack", { status: "reading" });
  const ackMs = Date.now() - started;
  const now = options.now ?? new Date();
  const errors: string[] = [];
  const run: SearchRun = { searches: [], sources: [] };
  let firstTokenMs: number | null = null;
  let answer = "";
  let usage: TurnTrace["usage"];

  options.store.addMessage({
    id: newId(),
    userId: options.userId,
    role: "user",
    content: options.text,
    timestamp: now.toISOString(),
  });

  const prepared = prepareTurn(options.store, {
    userId: options.userId,
    text: options.text,
    timeZone: options.timeZone,
    now,
    clockNote: clockNote(now, options.clientNow),
  });

  const finish = (assistantId: string | null) => {
    const trace: TurnTrace = {
      turnId: newId(),
      userId: options.userId,
      anchors: prepared.anchors.map(({ phrase, date, rule, confidence }) => ({ phrase, date, rule, confidence })),
      recallHits: prepared.recall.dated.reduce((sum, day) => sum + day.messages.length, 0) + prepared.recall.topicHits.length,
      noRecord: prepared.recall.dated.filter((day) => day.missing).map((day) => day.anchor.phrase),
      searches: run.searches,
      ackMs,
      firstTokenMs,
      totalMs: Date.now() - started,
      usage,
      errors,
    };
    writeTrace(trace);
    if (assistantId) options.emit("done", { messageId: assistantId, timestamp: new Date().toISOString() });
  };

  if (!config.geminiKey) {
    errors.push("Missing GEMINI_API_KEY");
    options.emit("error", { message: "Add GEMINI_API_KEY to .env and restart." });
    finish(null);
    return;
  }

  try {
    const result = streamText({
      model: languageModel(config.model),
      system: prepared.system,
      messages: prepared.messages,
      tools: {
        web_search: createWebSearchTool(
          {
            changeCheck: prepared.changeCheck,
            baseline: prepared.baseline,
            deps: { apiKey: config.tavilyKey, ...options.searchDeps },
            onEvent: (event, data) => options.emit(event, data),
          },
          run,
        ),
      },
      stopWhen: stepCountIs(MAX_MODEL_STEPS),
      prepareStep: ({ stepNumber }) => (stepNumber >= MAX_SEARCH_GUARD ? { activeTools: [] } : undefined),
      maxRetries: 1,
      abortSignal: options.signal,
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      onError: ({ error }) => {
        errors.push(error instanceof Error ? error.message : "model error");
      },
    });

    for await (const part of result.fullStream) {
      if (part.type !== "text-delta") continue;
      const text = part.text;
      if (!text) continue;
      if (firstTokenMs === null) firstTokenMs = Date.now() - started;
      answer += text;
      options.emit("text", { text });
    }
    const rawUsage = await result.usage;
    usage = { inputTokens: rawUsage.inputTokens, outputTokens: rawUsage.outputTokens };
  } catch (error) {
    if (options.signal?.aborted) return;
    const message = error instanceof Error ? error.message : "The reply failed.";
    errors.push(message);
    options.emit("error", { message });
  }

  if (!answer.trim()) {
    if (!errors.length) options.emit("error", { message: "No answer was produced." });
    finish(null);
    return;
  }

  const assistantId = newId();
  options.store.addMessage({
    id: assistantId,
    userId: options.userId,
    role: "assistant",
    content: answer,
    timestamp: new Date().toISOString(),
    sources: run.sources,
  });
  options.emit("sources", { sources: run.sources });
  scheduleExtraction(options.store, {
    userId: options.userId,
    messageId: assistantId,
    localDate: prepared.localDate,
    userText: options.text,
    answer,
  });
  finish(assistantId);
}

const MAX_SEARCH_GUARD = MAX_MODEL_STEPS - 1;

function clockNote(now: Date, clientNow?: string): string | undefined {
  if (!clientNow) return undefined;
  const skew = Math.abs(now.getTime() - new Date(clientNow).getTime());
  if (!Number.isFinite(skew) || skew < 10 * 60 * 1000) return undefined;
  return `The browser clock differs from the server by ${Math.round(skew / 60000)} minutes. Dates use the server instant.`;
}
