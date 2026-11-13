const STOP = new Set(
  "a an the of to and or for on in at by from with about as is was were be been being it this that those these i you we they what when where who how has have had do did any since then them".split(
    " ",
  ),
);

export interface ScoredDoc {
  id: string;
  text: string;
}

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length > 1 && !STOP.has(word));
}

/** Small BM25. Conversation volume does not justify embeddings. */
export function bm25(docs: ScoredDoc[], query: string, limit: number): Array<{ id: string; score: number }> {
  const q = tokens(query);
  if (q.length === 0 || docs.length === 0) return [];
  const docsTokens = docs.map((doc) => tokens(doc.text));
  const avg = docsTokens.reduce((sum, row) => sum + row.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const row of docsTokens) {
    for (const term of new Set(row)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const k1 = 1.2;
  const b = 0.75;
  const ranked = docs.map((doc, index) => {
    const row = docsTokens[index];
    const tf = new Map<string, number>();
    for (const term of row) tf.set(term, (tf.get(term) ?? 0) + 1);
    let score = 0;
    for (const term of q) {
      const freq = tf.get(term) ?? 0;
      if (!freq) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log((docs.length - n + 0.5) / (n + 0.5) + 1);
      score += (idf * (freq * (k1 + 1))) / (freq + k1 * (1 - b + b * (row.length / avg)));
    }
    return { id: doc.id, score };
  });
  return ranked
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
