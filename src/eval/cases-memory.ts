import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { config } from "../config.js";
import { prepareTurn } from "../agent/prepare.js";
import { runChat } from "../agent/chat.js";
import { createApp } from "../server/app.js";
import type { Store } from "../store/db.js";
import { NOW, TZ, tempStore } from "./helpers.js";

export interface EvalCase {
  id: string;
  name: string;
  run: () => Promise<void> | void;
}

export const memoryCases: EvalCase[] = [
  { id: "11", name: "recall respects the local day, not UTC", run: recallLocalDay },
  { id: "12", name: "missing day is NO RECORD and notes another weekday in the thread", run: noRecord },
  { id: "13", name: "topic recall finds the Postgres hosting exchange", run: topicRecall },
  { id: "14", name: "warm Monday CRM thread recalls the shortlist and claims", run: warmCrm },
  { id: "15", name: "cold CRM question fabricates nothing", run: coldCrm },
  { id: "16", name: "what was asked on 3 November is quoted from the log", run: askedNovember },
  { id: "17", name: "3 November with an empty thread is NO RECORD", run: missingNovember },
  { id: "18", name: "last Tuesday Postgres claims are the change baseline", run: lastTuesday },
  { id: "19", name: "seed endpoint stores backdated history", run: seedHttp },
  { id: "20", name: "the only tool in the codebase is web_search", run: oneTool },
  { id: "21", name: "the client is acknowledged before any model call", run: ackFirst },
];

function recallLocalDay() {
  const store = tempStore();
  const userId = "user-local-day";
  store.addMessage(msg(userId, "a", "included local day", "2026-11-11T10:00:00.000Z"));
  store.addMessage(msg(userId, "b", "next local day", "2026-11-11T20:00:00.000Z"));
  store.addMessage(msg(userId, "c", "previous local day", "2026-11-10T12:00:00.000Z"));
  store.addMessage(msg(userId, "current", "What did we say today?", NOW.toISOString()));
  const prepared = prepareTurn(store, { userId, text: "What did we say today?", timeZone: TZ, now: NOW });
  const today = prepared.recall.dated.find((day) => day.anchor.phrase.toLowerCase() === "today");
  const contents = today?.messages.map((message) => message.content) ?? [];
  if (!contents.some((content) => content.includes("included local day"))) throw new Error("missed the local day");
  if (contents.some((content) => content.includes("next local day") || content.includes("previous local day"))) {
    throw new Error(`UTC day leaked into the local window: ${contents.join(" | ")}`);
  }
  store.close();
}

function noRecord() {
  const store = tempStore();
  const userId = "user-no-record";
  store.addMessage(msg(userId, "old", "We looked at five tools on this Monday.", "2026-11-02T04:00:00.000Z"));
  store.addMessage(msg(userId, "current", "On Monday we talked", NOW.toISOString()));
  const prepared = prepareTurn(store, { userId, text: "On Monday we talked", timeZone: TZ, now: NOW });
  const monday = prepared.anchors.find((anchor) => anchor.rule === "bare-weekday");
  if (monday?.date !== "2026-11-09") throw new Error(`monday resolved to ${monday?.date}`);
  if (!monday.note?.includes("2026-11-02")) throw new Error(`missing disagreement note: ${monday.note}`);
  if (!prepared.system.includes("NO RECORD FOUND for 2026-11-09")) throw new Error("prompt omitted NO RECORD");
  store.close();
}

function topicRecall() {
  const store = tempStore();
  const userId = "user-topic-pg";
  store.addMessage(msg(userId, "u1", "Please shortlist CRM tools for sales.", "2026-11-02T04:00:00.000Z", "user"));
  store.addMessage(msg(userId, "a1", "HubSpot and Salesforce are the obvious pair.", "2026-11-02T04:05:00.000Z"));
  store.addMessage(msg(userId, "u2", "What is the cheapest Postgres hosting?", "2026-11-04T04:00:00.000Z", "user"));
  store.addMessage(msg(userId, "a2", "For Postgres hosting, Neon Launch is $19 per month. Supabase Pro is $25.", "2026-11-04T04:05:00.000Z"));
  const text = "Go back to the Postgres hosting question";
  store.addMessage(msg(userId, "current", text, NOW.toISOString(), "user"));
  const prepared = prepareTurn(store, { userId, text, timeZone: TZ, now: NOW });
  const blob = prepared.recall.topicHits.map((hit) => hit.message.content).join(" ");
  if (!blob.includes("Neon")) throw new Error(`topic hits missed Neon: ${blob}`);
  store.close();
}

function warmCrm() {
  const store = tempStore();
  const userId = "user-warm-crm";
  seedCrm(store, userId);
  const text = "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?";
  store.addMessage(msg(userId, "current", text, NOW.toISOString(), "user"));
  const prepared = prepareTurn(store, { userId, text, timeZone: TZ, now: NOW });
  for (const name of ["HubSpot", "Salesforce", "Pipedrive", "Close", "Copper"]) {
    if (!prepared.system.includes(name)) throw new Error(`warm prompt missing ${name}`);
  }
  if (!prepared.system.includes("$20/user")) throw new Error("warm prompt missing the ledger price");
  if (prepared.system.includes("NO RECORD FOUND for")) throw new Error("warm prompt claimed a missing record");
  if (!prepared.changeCheck || prepared.baseline !== "2026-11-09") {
    throw new Error(`expected change baseline 2026-11-09, got ${prepared.baseline}`);
  }
  if (!prepared.system.includes("parallel")) throw new Error("prompt does not require parallel searches");
  store.close();
}

function coldCrm() {
  const store = tempStore();
  const userId = "user-cold-crm";
  const text = "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?";
  store.addMessage(msg(userId, "current", text, NOW.toISOString(), "user"));
  const prepared = prepareTurn(store, { userId, text, timeZone: TZ, now: NOW });
  if (!prepared.system.includes("NO RECORD FOUND")) throw new Error("cold prompt did not admit a missing record");
  for (const name of ["HubSpot", "Salesforce", "Pipedrive", "Copper"]) {
    if (prepared.system.includes(name)) throw new Error(`cold prompt invented ${name}`);
  }
  if (!prepared.system.includes("COLD START") && !prepared.system.includes("no record of it")) {
    throw new Error("cold-start instruction missing");
  }
  store.close();
}

function askedNovember() {
  const store = tempStore();
  const userId = "user-ask-nov3";
  const quote = "Which Postgres host is cheapest for a small team?";
  store.addMessage(msg(userId, "q", quote, "2026-11-03T04:30:00.000Z", "user"));
  const text = "What did I ask you on 3 November?";
  store.addMessage(msg(userId, "current", text, NOW.toISOString(), "user"));
  const prepared = prepareTurn(store, { userId, text, timeZone: TZ, now: NOW });
  if (!prepared.system.includes(quote)) throw new Error("3 November quote missing");
  if (prepared.changeCheck) throw new Error("a recall question was treated as a change check");
  store.close();
}

function missingNovember() {
  const store = tempStore();
  const userId = "user-miss-nov";
  const text = "What did I ask you on 3 November?";
  store.addMessage(msg(userId, "current", text, NOW.toISOString(), "user"));
  const prepared = prepareTurn(store, { userId, text, timeZone: TZ, now: NOW });
  if (!prepared.system.includes("NO RECORD FOUND for 2026-11-03")) throw new Error("missing NO RECORD for 3 November");
  if (prepared.system.includes("cheapest")) throw new Error("empty thread invented a past question");
  store.close();
}

function lastTuesday() {
  const store = tempStore();
  const userId = "user-last-tue";
  store.addMessage(msg(userId, "q", "Compare Postgres hosting prices.", "2026-11-03T04:30:00.000Z", "user"));
  store.addMessage(msg(userId, "a", "Neon Launch is $19 per month.", "2026-11-03T04:35:00.000Z"));
  store.addClaims([
    {
      id: "claim-neon",
      userId,
      messageId: "a",
      entity: "Neon",
      attribute: "price",
      value: "$19 per month",
      asOf: "2026-11-03",
      sourceUrl: "https://neon.tech/pricing",
    },
  ]);
  const text = "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?";
  store.addMessage(msg(userId, "current", text, NOW.toISOString(), "user"));
  const prepared = prepareTurn(store, { userId, text, timeZone: TZ, now: NOW });
  const last = prepared.anchors.find((anchor) => anchor.rule === "last-weekday");
  if (last?.date !== "2026-11-03") throw new Error(`last Tuesday resolved to ${last?.date}`);
  if (!prepared.system.includes("$19 per month") || !prepared.system.includes("Neon")) {
    throw new Error("ledger claim was not injected");
  }
  if (prepared.baseline !== "2026-11-03") throw new Error(`baseline ${prepared.baseline}`);
  store.close();
}

async function seedHttp() {
  const store = tempStore();
  const app = createApp(store);
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  try {
    const seeded = await fetch(`http://127.0.0.1:${port}/api/seed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "seed-user-1",
        messages: [
          { id: "s1", role: "user", content: "Remember this backdated note.", timestamp: "2026-11-03T04:30:00.000Z" },
        ],
      }),
    });
    if (!seeded.ok) throw new Error(`seed status ${seeded.status}`);
    const history = await fetch(`http://127.0.0.1:${port}/api/history?userId=seed-user-1`);
    const body = (await history.json()) as { messages: Array<{ content: string }> };
    if (body.messages[0]?.content !== "Remember this backdated note.") throw new Error("history did not return the seed");
    const prepared = prepareTurn(store, {
      userId: "seed-user-1",
      text: "What did I ask you on 3 November?",
      timeZone: TZ,
      now: NOW,
    });
    if (!prepared.system.includes("Remember this backdated note.")) throw new Error("seed was invisible to recall");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    store.close();
  }
}

function oneTool() {
  const root = path.resolve("src");
  const files = walk(root).filter((file) => !file.includes(`${path.sep}eval${path.sep}`));
  const hits = files.filter((file) => readFileSync(file, "utf8").includes("tool("));
  if (hits.length !== 1 || !hits[0].endsWith(path.join("agent", "tools.ts"))) {
    throw new Error(`expected one tool registration, found ${hits.join(", ")}`);
  }
  const chat = readFileSync(path.join(root, "agent", "chat.ts"), "utf8");
  if (!chat.includes("web_search:") || /tools:\s*\{[^}]*\w+_search:/.test(chat) === false) {
    throw new Error("chat does not register web_search");
  }
  if (chat.includes("memory") && chat.includes("tool(")) throw new Error("chat registers another tool");
}

async function ackFirst() {
  const source = readFileSync(path.resolve("src/agent/chat.ts"), "utf8");
  const ackAt = source.indexOf('emit("ack"');
  const modelAt = source.indexOf("streamText(");
  if (ackAt < 0 || modelAt < 0 || ackAt > modelAt) throw new Error("ack is not emitted before the model call");
  if (config.geminiKey) return;
  const store = tempStore();
  const events: string[] = [];
  await runChat({
    store,
    userId: "user-ack-test",
    text: "Hello",
    timeZone: TZ,
    now: NOW,
    emit: (event) => events.push(event),
  });
  store.close();
  if (events[0] !== "ack") throw new Error(`first event was ${events[0]}`);
  if (!events.includes("error")) throw new Error("missing key did not surface an error");
}

function seedCrm(store: Store, userId: string) {
  store.addMessage(msg(userId, "q", "Shortlist 5 CRM tools for a 20-person sales team.", "2026-11-09T03:30:00.000Z", "user"));
  store.addMessage(
    msg(
      userId,
      "a",
      "Shortlist: HubSpot Starter at $20/user, Salesforce Starter at $25/user, Pipedrive Essential at $14/user, Close Startup at $9/user, Copper Starter at $29/user.",
      "2026-11-09T03:40:00.000Z",
    ),
  );
  store.addClaims([
    {
      id: "c1",
      userId,
      messageId: "a",
      entity: "HubSpot",
      attribute: "price",
      value: "$20/user",
      asOf: "2026-11-09",
      sourceUrl: "https://www.hubspot.com/pricing",
    },
  ]);
}

function msg(userId: string, id: string, content: string, timestamp: string, role: "user" | "assistant" = "assistant") {
  return { id, userId, role, content, timestamp, sources: [] };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".ts") ? [full] : [];
  });
}
