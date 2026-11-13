import "dotenv/config";

export const config = {
  geminiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
  tavilyKey: process.env.TAVILY_API_KEY ?? "",
  model: process.env.MODEL || "gemini-2.5-flash",
  fastModel: process.env.FAST_MODEL || "gemini-3.5-flash-lite",
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || "data/chat.db",
  tracePath: process.env.TRACE_PATH || "traces/turns.jsonl",
};

export function requireKey(name: "geminiKey" | "tavilyKey"): string {
  const value = config[name];
  if (!value) {
    const env = name === "geminiKey" ? "GEMINI_API_KEY" : "TAVILY_API_KEY";
    throw new Error(`Missing ${env}. Copy .env.example to .env and set it.`);
  }
  return value;
}
