# PROBLEM

## Task
Build a chat agent a human can talk to. It has exactly ONE tool: web search.
Goal: as good as the best web-search chat agents on the internet today.

## Hard rules
- JavaScript or TypeScript on Node.
- Runs with `npm install` then `npm run dev`.
- Every API key listed in `.env.example`.
- Any framework, any model.
- Public GitHub repo containing a one-page `DESIGN.md`: how it works, why built this way, what was considered and rejected, what we'd do with another week.
- AI coding tools allowed; every decision must be explainable.

## How it is judged
- Best architecture wins, not first submission, not prettiest UI, not most features.
- Judges chat with the agent like real users, read the code, read DESIGN.md.
- Three qualities: answers fast, gets things right, good to talk to.

## What the hidden test set looks like
Questions depend on time and conversation memory:
1. "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?"
2. "What did I ask you on 3 November? Is your answer still correct today?"
3. "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"

## What these questions really require
- Resolve relative dates ("Monday", "last Tuesday", "since then") to absolute dates, in the user's timezone, anchored to the real current date and to the conversation's own timestamps.
- Recall what was said and answered on that date from persistent history.
- Extract the specific claims from the old answer (prices, features, versions).
- Re-verify each claim with fresh, date-filtered search and report what changed, what did not, and what could not be verified.
- Behave honestly when the referenced history does not exist in the thread (the test harness may start from a cold chat): never invent a past conversation; still be useful.

## Failure modes to design against
- Hallucinating past conversations or old prices.
- Saying "no changes" without having searched.
- Misreading "Monday" or "last Tuesday".
- Slow answers from sequential searches or extra planner LLM calls.
- Stale answers from the model's training data.
- Search results containing instructions (prompt injection).
- Search outage or timeout producing a fabricated answer.
- Walls of text, hedging, filler, unclear sourcing.

## Constraints that shape the design
- One tool only: memory and time awareness must be prompt context, not extra tools.
- Must work from a cold start with zero setup beyond API keys.