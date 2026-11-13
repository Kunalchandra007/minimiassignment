import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import type { DateAnchor } from "../types.js";

export interface TurnTrace {
  turnId: string;
  userId: string;
  anchors: Array<Pick<DateAnchor, "phrase" | "date" | "rule" | "confidence">>;
  recallHits: number;
  noRecord: string[];
  searches: Array<{ query: string; start_date: string | null; ok: boolean; ms: number }>;
  ackMs: number;
  firstTokenMs: number | null;
  totalMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  errors: string[];
}

export function writeTrace(trace: TurnTrace, file = config.tracePath): void {
  const line = JSON.stringify({ level: "turn", ...trace });
  console.log(line);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${line}\n`);
}
