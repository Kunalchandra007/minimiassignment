function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

function isTable(lines) {
  return lines.length >= 2 && lines.every((line) => line.trim().includes("|")) && /^\s*\|?\s*:?-{3,}/.test(lines[1]);
}

function table(lines) {
  const cells = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => inline(cell.trim()));
  const head = cells(lines[0]);
  const body = lines.slice(2).map((line) => `<tr>${cells(line).map((cell) => `<td>${cell}</td>`).join("")}</tr>`);
  return `<table><thead><tr>${head.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${body.join("")}</tbody></table>`;
}

function renderMarkdown(source) {
  const lines = String(source ?? "").replaceAll("\r\n", "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) {
      i += 1;
      continue;
    }
    if (lines[i].startsWith("```")) {
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if (lines[i].trim().startsWith("|")) {
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        buf.push(lines[i]);
        i += 1;
      }
      blocks.push(isTable(buf) ? table(buf) : `<p>${buf.map(inline).join("<br>")}</p>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(lines[i])) {
      const buf = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(`<ul>${buf.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(lines[i])) {
      const buf = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(`<ol>${buf.map((item) => `<li>${inline(item)}</li>`).join("")}</ol>`);
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(lines[i]);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level + 2}>${inline(heading[2])}</h${level + 2}>`);
      i += 1;
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("```") && !lines[i].trim().startsWith("|") && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^#{1,3}\s+/.test(lines[i])) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return blocks.join("");
}
