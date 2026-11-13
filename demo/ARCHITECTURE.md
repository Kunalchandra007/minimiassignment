# Architecture

A turn has seven steps. The user waits on one of them.

1. The browser sends the message, a stable user id, the IANA timezone, and the client clock.
2. `src/time` resolves Monday, last Tuesday, 3 November, and since to absolute days. It does not call a model. A bare weekday is the most recent past one, never today. Last Tuesday is that weekday in the previous Monday-start week. Since, with no date after it, is the timestamp of the previous assistant answer. The math uses the user's zone, not the server's.
3. `src/recall` loads that local day verbatim and adds a few keyword hits. An empty day is injected as the literal line `NO RECORD FOUND`.
4. `src/context` builds the prompt: the standing rules, a now-block, the anchors, the recall, the claim ledger for those answers, the last eight turns, and a dated log of the older ones.
5. `src/agent/chat.ts` makes one Gemini call with the only tool, `web_search`. Several entities go out in the same step. The turn stops at eight searches and three search rounds, then the tools are turned off so the model has to answer.
6. The first SSE event is an acknowledgement, sent before that call. Search chips and tokens follow as they happen.
7. After the reply is saved, a smaller Gemini model files claims and a day digest. That call is not on the way to the user. If it fails, the next turn still has the verbatim answer.

Search is Tavily, with a ten-second timeout, one retry, a ten-minute cache, and snippets marked untrusted. A change question that omits `start_date` is given the baseline date in code, so "unchanged" cannot rest on an undated search.

Rejected, and why: embeddings (the threads are small and a date lookup is exact), memory as a second tool (the rule is one tool), a planner (it spends a model call before the first token), LangChain (it hides the reason a date was chosen), and summarizing the whole history (the tests ask for the exact wording on an exact day).

`DESIGN.md` is the one-page version of this, and it is the document the application asks for.
