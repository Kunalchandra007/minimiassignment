# Eval results

Deterministic suite, run without model or search keys. 30/30 passed. Median case 5 ms.

Live answer-quality judging is skipped until `GEMINI_API_KEY` and `TAVILY_API_KEY` are set. The assertions below are the ones that can be proven without a model: date rules, recall, the claim ledger, search failure behavior, and the single-tool boundary.

| id | result | ms | scenario |
| --- | --- | --- | --- |
| 01 | pass | 52 | bare Monday is the most recent past Monday, not today |
| 02 | pass | 175 | on a Monday, bare Monday is the previous Monday |
| 03 | pass | 0 | last Tuesday is that weekday in the previous calendar week |
| 04 | pass | 1 | 3 November stays this year and a future month rolls back |
| 05 | pass | 0 | since then uses the previous assistant timestamp |
| 06 | pass | 0 | since then with no history does not invent a date |
| 07 | pass | 0 | since Monday is a weekday, not an empty since |
| 08 | pass | 0 | today, yesterday, and an ISO date |
| 09 | pass | 0 | late night in Los Angeles is not the UTC date |
| 10 | pass | 1 | one sentence can carry Monday, last Tuesday, this Tuesday, and next Tuesday |
| 11 | pass | 26 | recall respects the local day, not UTC |
| 12 | pass | 15 | missing day is NO RECORD and notes another weekday in the thread |
| 13 | pass | 18 | topic recall finds the Postgres hosting exchange |
| 14 | pass | 19 | warm Monday CRM thread recalls the shortlist and claims |
| 15 | pass | 16 | cold CRM question fabricates nothing |
| 16 | pass | 18 | what was asked on 3 November is quoted from the log |
| 17 | pass | 16 | 3 November with an empty thread is NO RECORD |
| 18 | pass | 19 | last Tuesday Postgres claims are the change baseline |
| 19 | pass | 86 | seed endpoint stores backdated history |
| 20 | pass | 4 | the only tool in the codebase is web_search |
| 21 | pass | 18 | the client is acknowledged before any model call |
| 22 | pass | 889 | search outage returns an error and retries only when it should |
| 23 | pass | 406 | a failed search is retried once |
| 24 | pass | 1 | identical searches hit the ten-minute cache |
| 25 | pass | 1 | results are deduped and snippets are capped |
| 26 | pass | 5 | a turn stops at 8 searches |
| 27 | pass | 1 | a change question fills start_date from the baseline |
| 28 | pass | 0 | a plain question does not invent a date filter |
| 29 | pass | 0 | prompt-injection text stays untrusted data |
| 30 | pass | 0 | the system prompt states the change and recall protocol |
