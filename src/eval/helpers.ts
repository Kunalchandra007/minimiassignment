import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openStore } from "../store/db.js";

export const NOW = new Date("2026-11-11T12:00:00.000Z");
export const TZ = "Asia/Kolkata";

export function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minimis-"));
  return openStore(path.join(dir, "eval.db"));
}
