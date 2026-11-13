const log = document.querySelector("#log");
const form = document.querySelector("#composer");
const input = document.querySelector("#input");
const send = document.querySelector("#send");
const prompts = [
  ["Monday's shortlist", "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?"],
  ["3 November", "What did I ask you on 3 November? Is your answer still correct today?"],
  ["Postgres hosting", "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"],
];

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const userId = loadUserId();
let streaming = false;

document.querySelector("#zone").textContent = zone;
document.querySelector("#thread").textContent = `Thread ${userId.slice(0, 8)}`;
document.querySelector("#new-chat").addEventListener("click", markBreak);
form.addEventListener("submit", onSubmit);
input.addEventListener("input", grow);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
tick();
setInterval(tick, 30000);
loadHistory();
const asked = new URLSearchParams(location.search).get("ask");
if (asked) {
  input.value = asked;
  grow();
  input.focus();
}

function loadUserId() {
  const existing = localStorage.getItem("minimis.user");
  if (existing && /^[a-zA-Z0-9_-]{8,80}$/.test(existing)) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem("minimis.user", created);
  return created;
}

function tick() {
  const now = new Date();
  document.querySelector("#weekday").textContent = new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(now);
  document.querySelector("#full-date").textContent = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  document.querySelector("#clock").textContent = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

async function loadHistory() {
  const response = await fetch(`/api/history?userId=${encodeURIComponent(userId)}`);
  const body = await response.json();
  log.replaceChildren();
  if (!body.messages?.length) {
    renderEmpty();
    return;
  }
  for (const message of body.messages) renderMessage(message, false);
  scrollDown();
}

function renderEmpty() {
  const wrap = document.createElement("div");
  wrap.className = "empty";
  const copy = document.createElement("p");
  copy.textContent = "The thread is empty. A question about a past date will say so, then answer the obvious reading.";
  const row = document.createElement("div");
  row.className = "prompts";
  for (const [label, text] of prompts) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "prompt";
    button.textContent = label;
    button.addEventListener("click", () => {
      input.value = text;
      grow();
      input.focus();
    });
    row.appendChild(button);
  }
  wrap.append(copy, row);
  log.replaceChildren(wrap);
}

function markBreak() {
  if (!log.querySelector(".msg") && !log.querySelector(".break")) return;
  const rule = document.createElement("div");
  rule.className = "break";
  rule.textContent = "New chat · record kept";
  log.appendChild(rule);
  input.focus();
  scrollDown();
}

function renderMessage(message, animate) {
  const item = document.createElement("article");
  item.className = `msg ${message.role}`;
  if (!animate) item.style.animation = "none";
  const stamp = document.createElement("p");
  stamp.className = "stamp";
  stamp.textContent = stampFor(message.timestamp);
  item.appendChild(stamp);
  if (message.role === "user") {
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = message.content;
    item.appendChild(bubble);
  } else {
    const body = document.createElement("div");
    body.className = "body";
    body.innerHTML = renderMarkdown(message.content);
    item.appendChild(body);
    if (message.sources?.length) item.appendChild(sourceList(message.sources));
  }
  log.appendChild(item);
  return item;
}

function stampFor(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: zone,
  }).format(new Date(iso));
}

function sourceList(sources) {
  const details = document.createElement("details");
  details.className = "sources";
  const summary = document.createElement("summary");
  summary.textContent = `${sources.length} source${sources.length === 1 ? "" : "s"}`;
  const list = document.createElement("ol");
  for (const source of sources) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = source.title || source.url;
    li.appendChild(link);
    if (source.publishedDate) {
      const when = document.createElement("span");
      when.className = "when";
      when.textContent = ` · ${source.publishedDate}`;
      li.appendChild(when);
    }
    list.appendChild(li);
  }
  details.append(summary, list);
  return details;
}

async function onSubmit(event) {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || streaming) return;
  streaming = true;
  send.disabled = true;
  log.querySelector(".empty")?.remove();
  renderMessage({ role: "user", content: text, timestamp: new Date().toISOString() }, true);
  input.value = "";
  grow();
  const article = startAssistant();
  scrollDown();
  try {
    await streamReply(text, article);
  } catch (error) {
    article.querySelector(".body").innerHTML = `<p class="error">${escapeHtml(error.message || "The reply failed.")}</p>`;
  } finally {
    streaming = false;
    send.disabled = false;
    input.focus();
  }
}

function startAssistant() {
  const item = document.createElement("article");
  item.className = "msg assistant";
  const stamp = document.createElement("p");
  stamp.className = "stamp";
  stamp.textContent = "Now";
  const chips = document.createElement("div");
  chips.className = "chips";
  const body = document.createElement("div");
  body.className = "body";
  body.innerHTML = "<p>Reading the record…</p>";
  item.append(stamp, chips, body);
  log.appendChild(item);
  item._text = "";
  item._chips = chips;
  return item;
}

async function streamReply(text, article) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: text,
      userId,
      timezone: zone,
      clientNow: new Date().toISOString(),
    }),
  });
  if (!response.ok || !response.body) {
    const failure = await response.json().catch(() => ({ error: "Chat failed." }));
    throw new Error(failure.error || "Chat failed.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) handleEvent(chunk, article);
  }
}

function handleEvent(chunk, article) {
  const eventLine = chunk.split("\n").find((line) => line.startsWith("event:"));
  const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
  if (!eventLine || !dataLine) return;
  const name = eventLine.slice(6).trim();
  const data = JSON.parse(dataLine.slice(5));
  if (name === "tool-start") addChip(article, data, true);
  if (name === "tool-end") settleChip(article, data);
  if (name === "text") {
    article._text += data.text;
    article.querySelector(".body").innerHTML = renderMarkdown(article._text);
    scrollDown();
  }
  if (name === "sources" && data.sources?.length) {
    article.appendChild(sourceList(data.sources));
  }
  if (name === "done" && data.timestamp) {
    article.querySelector(".stamp").textContent = stampFor(data.timestamp);
  }
  if (name === "error") {
    const body = article.querySelector(".body");
    const message = `<p class="error">${escapeHtml(data.message || "The reply failed.")}</p>`;
    body.innerHTML = article._text ? `${renderMarkdown(article._text)}${message}` : message;
  }
}

function addChip(article, data, live) {
  const chip = document.createElement("span");
  chip.className = live ? "chip live" : "chip";
  chip.dataset.query = data.query;
  const when = data.start_date ? ` · from ${data.start_date}` : "";
  chip.textContent = `Search · ${data.query}${when}`;
  article._chips.appendChild(chip);
  scrollDown();
}

function settleChip(article, data) {
  const chips = [...article._chips.querySelectorAll(".chip")].reverse();
  const chip = chips.find((item) => item.dataset.query === data.query && item.classList.contains("live"));
  if (!chip) return;
  chip.classList.remove("live");
  if (!data.ok) chip.classList.add("bad");
  chip.textContent = `${data.ok ? "Searched" : "Search failed"} · ${data.query}${typeof data.count === "number" ? ` · ${data.count}` : ""}`;
}

function grow() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

function scrollDown() {
  log.scrollTop = log.scrollHeight;
}
