# Design

## How it works

A turn is one path. The server takes the message, user id, timezone, and client clock. Code resolves every date phrase to an absolute day and pulls that day's messages, plus a few keyword hits, from SQLite. The prompt is the rules, a now-block, those anchors, a verbatim recall or an explicit `NO RECORD FOUND`, the claim ledger, recent turns, and a dated log of the rest. Gemini then streams an answer and may call `web_search` in parallel, at most eight times across three rounds. Search chips and tokens go out over SSE immediately. After the reply is saved, a smaller Gemini model files claims and a day digest off the response path.

## Why

Relative dates and "what did I ask on the 3rd" are rules and queries. A model is worse and slower at both, and it will invent a conversation when the table is empty. The ledger exists so a change question verifies old prices instead of researching from zero. The ledger is allowed to be missing: the verbatim answer is still in the prompt. One tool is a hard rule, so memory is context, not a function the model can call. There is no planner and no router. The only extra model call is the smaller Gemini model, and it runs after the user already has the answer. Search is cached for ten minutes, retried once, and killed at ten seconds. A failure is data the model must report. Result text is marked untrusted so a page cannot instruct the agent.

## Considered and rejected

Embeddings for memory: the threads are small, and a date lookup is exact. Keyword scoring is enough for "the Postgres hosting question", and it is inspectable. Memory as a second tool: it would break the one-tool rule and add a hop. A planner or a multi-agent loop: another model call before the first token, which is the latency we are trying to avoid. LangChain: more machinery between the trace and the reason a date was chosen. Summarizing the whole history: a summary drops the exact wording and the exact day the tests ask us to quote. One search for a five-tool shortlist: the snippets come back mixed and thin. One query per entity, in the same step, is the same wall time as the slowest of them.

## Results

`npm run eval` is 30 deterministic scenarios and does not call a model. Latest run: 30/30 passed, median case 6 ms. The full table is [eval/results.md](eval/results.md).

| Cases | What they lock | Result |
| --- | --- | --- |
| 01–10 | Monday, last Tuesday, 3 November, since then, Pacific late night vs UTC | pass |
| 11–21 | Local-day recall, no fabricated CRM list, 3 November quote, ledger, seed API, one tool, ack before the model | pass |
| 22–30 | Timeout and retry, cache, snippet cap, 8-search cap, baseline `start_date`, injection left as data | pass |

Building the warm Monday CRM prompt took 28 ms. With no API key, the trace recorded `ackMs: 0` and a total of 2 ms, and the client received an error instead of a made-up answer. Live first-token time is not in this table; it needs the keys. The budgets are a non-search first token under 1.5 s, a search first token under 3 s, and a full search answer with p50 under 8 s. Each live turn writes anchors, recall hits, searches, and both latencies to the console and to `traces/turns.jsonl`.

## With another week

Rerank the snippets with a cross-encoder before they reach the model. Fetch the pricing page itself when the snippet is too thin to support a verdict. Add a second search provider that is used only after Tavily fails. Re-check ledger claims on a schedule so a change can be noticed before the user asks. Learn a user's timezone from the thread instead of trusting only the browser. A tighter mobile layout, and voice if the page is still the right surface.
