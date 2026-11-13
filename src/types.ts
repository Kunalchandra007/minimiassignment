export type Role = "user" | "assistant";

export interface Source {
  title: string;
  url: string;
  publishedDate: string | null;
}

export interface StoredMessage {
  id: string;
  userId: string;
  role: Role;
  content: string;
  timestamp: string;
  sources: Source[];
}

export interface Claim {
  id: string;
  userId: string;
  messageId: string;
  entity: string;
  attribute: string;
  value: string;
  asOf: string;
  sourceUrl: string | null;
}

export interface DayDigest {
  userId: string;
  localDate: string;
  summary: string;
  topics: string[];
}

export interface DateAnchor {
  phrase: string;
  date: string | null;
  rule: string;
  confidence: "high" | "medium" | "low";
  note?: string;
}

export interface SearchArgs {
  query: string;
  topic: "general" | "news";
  start_date?: string;
  end_date?: string;
  depth: "basic" | "advanced";
}

export interface SearchHit {
  title: string;
  url: string;
  publishedDate: string | null;
  snippet: string;
}

export interface SearchOutcome {
  trust: "untrusted";
  notice: string;
  ok: boolean;
  query: string;
  start_date: string | null;
  startDateSource: "model" | "baseline" | "none";
  error?: string;
  results: SearchHit[];
}
