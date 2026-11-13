import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Claim, DayDigest, Role, Source, StoredMessage } from "../types.js";

export interface NewMessage {
  id: string;
  userId: string;
  role: Role;
  content: string;
  timestamp: string;
  sources?: Source[];
}

export function openStore(dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      sources_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_messages_user_time ON messages(user_id, timestamp);
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      entity TEXT NOT NULL,
      attribute TEXT NOT NULL,
      value TEXT NOT NULL,
      as_of TEXT NOT NULL,
      source_url TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_claims_user ON claims(user_id, created_at);
    CREATE TABLE IF NOT EXISTS day_digests (
      user_id TEXT NOT NULL,
      local_date TEXT NOT NULL,
      summary TEXT NOT NULL,
      topics TEXT NOT NULL,
      PRIMARY KEY (user_id, local_date)
    );
  `);

  const insertMessage = db.prepare(
    `INSERT INTO messages (id, user_id, role, content, timestamp, sources_json)
     VALUES (@id, @userId, @role, @content, @timestamp, @sources)`,
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, user_id, message_id, entity, attribute, value, as_of, source_url, created_at)
     VALUES (@id, @userId, @messageId, @entity, @attribute, @value, @asOf, @sourceUrl, @createdAt)`,
  );

  function mapMessage(row: {
    id: string;
    user_id: string;
    role: Role;
    content: string;
    timestamp: string;
    sources_json: string;
  }): StoredMessage {
    return {
      id: row.id,
      userId: row.user_id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      sources: JSON.parse(row.sources_json) as Source[],
    };
  }

  return {
    db,
    addMessage(message: NewMessage) {
      insertMessage.run({ ...message, sources: JSON.stringify(message.sources ?? []) });
    },
    addMessages(messages: NewMessage[]) {
      const tx = db.transaction((rows: NewMessage[]) => {
        for (const row of rows) {
          insertMessage.run({ ...row, sources: JSON.stringify(row.sources ?? []) });
        }
      });
      tx(messages);
    },
    clearUser(userId: string) {
      db.prepare("DELETE FROM messages WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM claims WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM day_digests WHERE user_id = ?").run(userId);
    },
    messages(userId: string): StoredMessage[] {
      const rows = db
        .prepare("SELECT * FROM messages WHERE user_id = ? ORDER BY timestamp ASC, rowid ASC")
        .all(userId) as Parameters<typeof mapMessage>[0][];
      return rows.map(mapMessage);
    },
    messagesInRange(userId: string, startIso: string, endIso: string): StoredMessage[] {
      const rows = db
        .prepare(
          `SELECT * FROM messages WHERE user_id = ? AND timestamp >= ? AND timestamp < ?
           ORDER BY timestamp ASC, rowid ASC`,
        )
        .all(userId, startIso, endIso) as Parameters<typeof mapMessage>[0][];
      return rows.map(mapMessage);
    },
    recentMessages(userId: string, limit: number): StoredMessage[] {
      const rows = db
        .prepare(
          `SELECT * FROM messages WHERE user_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?`,
        )
        .all(userId, limit) as Parameters<typeof mapMessage>[0][];
      return rows.reverse().map(mapMessage);
    },
    addClaims(claims: Array<Omit<Claim, "id"> & { id: string }>) {
      const now = new Date().toISOString();
      const tx = db.transaction((rows: typeof claims) => {
        for (const row of rows) {
          insertClaim.run({
            id: row.id,
            userId: row.userId,
            messageId: row.messageId,
            entity: row.entity,
            attribute: row.attribute,
            value: row.value,
            asOf: row.asOf,
            sourceUrl: row.sourceUrl,
            createdAt: now,
          });
        }
      });
      tx(claims);
    },
    claims(userId: string, limit = 200): Claim[] {
      const rows = db
        .prepare(
          `SELECT id, user_id, message_id, entity, attribute, value, as_of, source_url
           FROM claims WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
        )
        .all(userId, limit) as Array<{
        id: string;
        user_id: string;
        message_id: string;
        entity: string;
        attribute: string;
        value: string;
        as_of: string;
        source_url: string | null;
      }>;
      return rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        messageId: row.message_id,
        entity: row.entity,
        attribute: row.attribute,
        value: row.value,
        asOf: row.as_of,
        sourceUrl: row.source_url,
      }));
    },
    upsertDigest(digest: DayDigest) {
      db.prepare(
        `INSERT INTO day_digests (user_id, local_date, summary, topics)
         VALUES (@userId, @localDate, @summary, @topics)
         ON CONFLICT(user_id, local_date) DO UPDATE SET summary = excluded.summary, topics = excluded.topics`,
      ).run({ ...digest, topics: JSON.stringify(digest.topics) });
    },
    digests(userId: string): DayDigest[] {
      const rows = db
        .prepare("SELECT user_id, local_date, summary, topics FROM day_digests WHERE user_id = ? ORDER BY local_date")
        .all(userId) as Array<{ user_id: string; local_date: string; summary: string; topics: string }>;
      return rows.map((row) => ({
        userId: row.user_id,
        localDate: row.local_date,
        summary: row.summary,
        topics: JSON.parse(row.topics) as string[],
      }));
    },
    close() {
      db.close();
    },
  };
}

export type Store = ReturnType<typeof openStore>;
