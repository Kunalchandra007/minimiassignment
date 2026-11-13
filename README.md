# Minimis

A chat agent with one tool: web search. Dates and memory are resolved in code before the model speaks, so "last Tuesday" and "what did I ask on 3 November" are lookups, not guesses.

Judges care about three things: answers that come back quickly, claims that are checked, and a conversation that does not invent a past it does not have. The design notes are in [DESIGN.md](DESIGN.md). The proof is `npm run eval` and [eval/results.md](eval/results.md).

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, copy the example env with `Copy-Item .env.example .env`.

Open http://localhost:3000 for the landing page, then enter the thread at http://localhost:3000/chat.html. `npm start` runs the same server without the file watcher.

You need two keys, both listed in `.env.example`:

| Variable | Used for |
| --- | --- |
| `GEMINI_API_KEY` | Gemini answers the user. A smaller Gemini model extracts claims after the reply. The key from [Google AI Studio](https://aistudio.google.com/apikey) works. `GOOGLE_GENERATIVE_AI_API_KEY` is accepted too. |
| `TAVILY_API_KEY` | The only tool. Date-filtered web search. |
| `MODEL` | Main model. Default `gemini-2.5-flash`. |
| `FAST_MODEL` | Background extraction. Default `gemini-3.5-flash-lite`. |
| `PORT` | Default `3000`. |

The server starts without keys. A chat then says the key is missing instead of inventing an answer. `npm run eval` does not need keys.

## What happens on a turn

1. The browser sends the message, a persistent user id, the IANA timezone, and the client clock.
2. A date resolver turns "Monday", "last Tuesday", "3 November", and "since then" into absolute dates. It does not call a model. Weeks start on Monday. A bare weekday is the most recent past one, never today. "Last Tuesday" is the Tuesday of the previous calendar week. "Since then" is the timestamp of the previous assistant answer.
3. Recall loads that local day verbatim, plus a few keyword hits. If the day is empty, the prompt gets an explicit `NO RECORD FOUND` line.
4. The prompt also gets a now-block, any claim-ledger rows for those answers, the recent turns, and a short dated log of older ones.
5. One Gemini call can use `web_search`. Several entities go out in parallel. The turn stops at 8 searches and 3 search rounds.
6. Tokens and search chips stream over server-sent events. The first event is an acknowledgement, sent before the model is called.
7. After the reply is saved, the smaller Gemini model extracts claims and a day digest. That work never blocks the user. If it has not finished, the next turn still has the verbatim answer.

Search results are labeled untrusted. A timeout or HTTP failure comes back as a structured error so the model can say the search failed. A change question that forgets `start_date` is given the baseline date anyway, so "no changes" cannot be claimed from an undated search.

"New chat" does not delete the thread. The record is the point.

## Seed a history

The hidden questions only make sense if the thread already contains Monday's shortlist or last Tuesday's Postgres notes. `POST /api/seed` writes timestamped messages (and optional claims) for a user id.

```bash
curl -s -X POST http://localhost:3000/api/seed \
  -H "content-type: application/json" \
  -d "{\"userId\":\"demo-user-1\",\"replace\":true,\"messages\":[{\"id\":\"q1\",\"role\":\"user\",\"content\":\"Shortlist 5 CRM tools for a 20-person sales team.\",\"timestamp\":\"2026-11-09T03:30:00.000Z\"},{\"id\":\"a1\",\"role\":\"assistant\",\"content\":\"Shortlist: HubSpot Starter at $20/user, Salesforce Starter at $25/user, Pipedrive Essential at $14/user, Close Startup at $9/user, Copper Starter at $29/user.\",\"timestamp\":\"2026-11-09T03:40:00.000Z\"}],\"claims\":[{\"messageId\":\"a1\",\"entity\":\"HubSpot\",\"attribute\":\"price\",\"value\":\"$20/user\",\"asOf\":\"2026-11-09\",\"sourceUrl\":\"https://www.hubspot.com/pricing\"}]}"
```

Set the browser's user id to the same value. In the console: `localStorage.setItem("minimis.user","demo-user-1")`, then reload. Timestamps are UTC. The resolver displays them in the browser's timezone, so pick instants that fall on the local day you mean. `GET /api/history?userId=demo-user-1` reads the thread back.

On a cold thread, the same question should say there is no record, then answer the obvious reading and mark it as an assumption.

## Eval

```bash
npm run eval
```

Thirty scenarios, no network. They cover the three sample questions in warm and cold forms, weekday rules, a late-night Pacific timezone against UTC, recall, the claim ledger, search failure, the 8-search cap, date filters, and prompt injection. The latest run is [eval/results.md](eval/results.md): 30/30 passed. Context for the warm CRM question was built in 28 ms. The acknowledgement before any model call was under 2 ms in the trace.

Live latency against Gemini and Tavily is not in that table. It depends on the keys and the network. The budgets the design is held to: a non-search first token under 1.5 s, a search reply's first token under 3 s, and a full search answer with p50 under 8 s. Traces for real chats are appended to `traces/turns.jsonl` and printed as JSON.

## Layout

```
src/index.ts            process entry
src/server/app.ts       HTTP, SSE, seed, history
src/agent/chat.ts       one streaming model call
src/agent/prepare.ts    resolve, recall, prompt
src/agent/prompt.ts     the standing rules
src/agent/budget.ts     change-check and caps
src/agent/tools.ts      the only tool
src/time/               weekday rules and timezones
src/recall/             day window and BM25
src/store/db.ts         SQLite messages, claims, digests
src/search/tavily.ts    timeout, retry, cache, trim
src/claims/extract.ts   background Gemini extraction
src/context/build.ts    the prompt the model actually sees
public/                 one page, no build step
```

SQLite is created at `data/chat.db` on first run. There is no second tool anywhere in `src`.

## Demo

[demo/minimis.mp4](demo/minimis.mp4) is the Monday CRM question on a seeded thread. `node scripts/seed-demo.mjs` writes that history for the user id `minimis-demo`. Set the same id in the browser with `localStorage.setItem("minimis.user","minimis-demo")` and reload. A cold thread, with nothing stored for Monday, says there is no record and does not invent the shortlist.
