import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { newId } from "../agent/prepare.js";
import { runChat } from "../agent/chat.js";
import type { Store } from "../store/db.js";
import type { Role, Source } from "../types.js";
import { openSse } from "./sse.js";

export function createApp(store: Store) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, model: config.model });
  });

  app.get("/api/history", (req, res) => {
    const userId = String(req.query.userId ?? "");
    if (!validUser(userId)) return res.status(400).json({ error: "Invalid user id." });
    res.json({ messages: store.messages(userId) });
  });

  app.post("/api/seed", (req, res) => {
    const body = req.body ?? {};
    const userId = String(body.userId ?? "");
    if (!validUser(userId)) return res.status(400).json({ error: "Invalid user id." });
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (body.replace) store.clearUser(userId);
    const rows = [];
    for (const message of messages) {
      if (!message || (message.role !== "user" && message.role !== "assistant")) {
        return res.status(400).json({ error: "Each message needs role user or assistant." });
      }
      if (typeof message.content !== "string" || typeof message.timestamp !== "string") {
        return res.status(400).json({ error: "Each message needs content and timestamp." });
      }
      rows.push({
        id: typeof message.id === "string" ? message.id : newId(),
        userId,
        role: message.role as Role,
        content: message.content,
        timestamp: new Date(message.timestamp).toISOString(),
        sources: (message.sources ?? []) as Source[],
      });
    }
    store.addMessages(rows);
    if (Array.isArray(body.claims)) {
      store.addClaims(
        body.claims.map((claim: Record<string, string | null>) => ({
          id: typeof claim.id === "string" ? claim.id : newId(),
          userId,
          messageId: String(claim.messageId),
          entity: String(claim.entity),
          attribute: String(claim.attribute),
          value: String(claim.value),
          asOf: String(claim.asOf),
          sourceUrl: claim.sourceUrl ? String(claim.sourceUrl) : null,
        })),
      );
    }
    res.json({ ok: true, messages: rows.length });
  });

  app.post("/api/chat", async (req, res) => {
    const body = req.body ?? {};
    const userId = String(body.userId ?? "");
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const timezone = typeof body.timezone === "string" ? body.timezone : "";
    if (!validUser(userId) || !message || message.length > 8000) {
      return res.status(400).json({ error: "A userId and a message are required." });
    }
    if (!validZone(timezone)) return res.status(400).json({ error: "Invalid timezone." });
    const send = openSse(res);
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    try {
      await runChat({
        store,
        userId,
        text: message,
        timeZone: timezone,
        clientNow: typeof body.clientNow === "string" ? body.clientNow : undefined,
        signal: abort.signal,
        searchDeps: { apiKey: config.tavilyKey },
        emit: send,
      });
    } catch (error) {
      send("error", { message: error instanceof Error ? error.message : "Chat failed." });
    }
    if (!res.writableEnded) res.end();
  });

  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");
  app.use(express.static(publicDir));
  return app;
}

function validUser(userId: string): boolean {
  return /^[a-zA-Z0-9_-]{8,80}$/.test(userId);
}

function validZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
