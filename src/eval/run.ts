import fs from "node:fs";
import path from "node:path";
import { memoryCases, type EvalCase } from "./cases-memory.js";
import { searchCases } from "./cases-search.js";
import { timeCases } from "./cases-time.js";

const cases: EvalCase[] = [...timeCases, ...memoryCases, ...searchCases];

const rows: Array<{ id: string; name: string; pass: boolean; ms: number; detail: string }> = [];

for (const item of cases) {
  const started = Date.now();
  try {
    await item.run();
    rows.push({ id: item.id, name: item.name, pass: true, ms: Date.now() - started, detail: "pass" });
    console.log(`ok  ${item.id}  ${item.name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "failed";
    rows.push({ id: item.id, name: item.name, pass: false, ms: Date.now() - started, detail });
    console.error(`fail ${item.id}  ${item.name}\n     ${detail}`);
  }
}

const passed = rows.filter((row) => row.pass).length;
const durations = rows.map((row) => row.ms).sort((a, b) => a - b);
const p50 = durations[Math.floor(durations.length / 2)] ?? 0;
const lines = [
  "# Eval results",
  "",
  `Deterministic suite, run without model or search keys. ${passed}/${rows.length} passed. Median case ${p50} ms.`,
  "",
  "Live answer-quality judging is skipped until `GEMINI_API_KEY` and `TAVILY_API_KEY` are set. The assertions below are the ones that can be proven without a model: date rules, recall, the claim ledger, search failure behavior, and the single-tool boundary.",
  "",
  "| id | result | ms | scenario |",
  "| --- | --- | --- | --- |",
  ...rows.map((row) => `| ${row.id} | ${row.pass ? "pass" : "fail"} | ${row.ms} | ${row.name} |`),
  "",
];
if (rows.some((row) => !row.pass)) {
  lines.push("## Failures", "");
  for (const row of rows.filter((row) => !row.pass)) lines.push(`- ${row.id} ${row.name}: ${row.detail}`);
  lines.push("");
}

const target = path.resolve("eval/results.md");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, lines.join("\n"));
console.log(`${passed}/${rows.length} passed. Wrote ${target}`);
if (passed !== rows.length) process.exitCode = 1;
