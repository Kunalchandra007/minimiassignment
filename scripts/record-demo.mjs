import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.DEMO_BASE || "http://127.0.0.1:3000";
const userId = "minimis-demo";
const question =
  "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?";

const health = await fetch(`${base}/api/health`).catch(() => null);
if (!health?.ok) {
  console.error("The server is not answering on " + base + ". Run npm run dev first.");
  process.exit(1);
}

const seeded = await fetch(`${base}/api/seed`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ userId, replace: false, messages: [] }),
});
if (!seeded.ok && seeded.status !== 400) {
  console.error("Could not reach the seed endpoint.");
  process.exit(1);
}

await import("./seed-demo.mjs");

await mkdir("demo/raw", { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 810 },
  timezoneId: "Asia/Kolkata",
  recordVideo: { dir: "demo/raw", size: { width: 1440, height: 810 } },
});
await context.addInitScript((id) => {
  localStorage.setItem("minimis.user", id);
}, userId);

const page = await context.newPage();
const marks = [];
const started = Date.now();
const mark = (name) => {
  const sec = ((Date.now() - started) / 1000).toFixed(1);
  marks.push(`${sec}s ${name}`);
  console.log(`mark ${sec}s ${name}`);
};

await page.goto(base, { waitUntil: "networkidle" });
mark("landing");
await page.waitForTimeout(6000);
await page.getByRole("link", { name: "Start a thread" }).click();
await page.waitForURL("**/chat.html");
await page.getByText("HubSpot Starter").first().waitFor({ timeout: 15000 });
mark("record");
await page.waitForTimeout(7000);
await page.locator("#input").fill(question);
mark("question");
await page.waitForTimeout(3500);
await page.locator("#send").click();
mark("sent");
await page.locator(".chip").first().waitFor({ timeout: 45000 });
mark("searching");
await page.waitForFunction(() => !document.querySelector("#send").disabled, null, { timeout: 120000 });
mark("answered");
await page.locator(".msg.assistant").last().evaluate((node) => node.scrollIntoView({ block: "start" }));
const answer = await page.locator(".msg.assistant").last().innerText();
await page.waitForTimeout(8000);
mark("held");
console.log(marks.join("\n"));
const video = page.video();
await context.close();
await browser.close();

if (/no record of a shortlist/i.test(answer) || /provide the names/i.test(answer)) {
  console.error("The turn did not use Monday's record. Recording kept for inspection, not promoted.");
  console.error(answer.slice(0, 400));
  process.exit(1);
}

const webm = await video.path();
console.log("Captured", webm);
await assemble(webm);
await rm("demo/raw", { recursive: true, force: true });
console.log("Wrote demo/minimis.mp4");

function assemble(webm) {
  const font = "demo/raw/georgia.ttf";
  return copyFile("C:/Windows/Fonts/georgia.ttf", font).then(() => {
    writeFileSync(
      "demo/raw/open.filter",
      `drawtext=fontfile=${font}:text='Minimis':fontsize=78:fontcolor=0x16130F:x=(w-text_w)/2:y=(h/2)-70,` +
        `drawtext=fontfile=${font}:text='One tool. The date is settled before the model speaks.':fontsize=28:fontcolor=0x4A433A:x=(w-text_w)/2:y=(h/2)+24`,
    );
    writeFileSync(
      "demo/raw/close.filter",
      `drawtext=fontfile=${font}:text='Resolve the date. Quote the record.':fontsize=40:fontcolor=0x16130F:x=(w-text_w)/2:y=(h/2)-56,` +
        `drawtext=fontfile=${font}:text='Search what changed.':fontsize=40:fontcolor=0x16130F:x=(w-text_w)/2:y=(h/2)+8,` +
        `drawtext=fontfile=${font}:text='One model call. The ledger runs after the answer.':fontsize=24:fontcolor=0x4A433A:x=(w-text_w)/2:y=(h/2)+78`,
    );
    const open = card(4, "demo/raw/open.mp4", "demo/raw/open.filter");
    const close = card(5, "demo/raw/close.mp4", "demo/raw/close.filter");
    const body = run("ffmpeg", [
      "-y",
      "-i",
      webm,
      "-vf",
      "scale=1440:810,fps=30",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "demo/raw/body.mp4",
    ]);
    return Promise.all([open, close, body]).then(() =>
      run("ffmpeg", [
        "-y",
        "-i",
        "demo/raw/open.mp4",
        "-i",
        "demo/raw/body.mp4",
        "-i",
        "demo/raw/close.mp4",
        "-filter_complex",
        "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
        "-map",
        "[v]",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "20",
        "-movflags",
        "+faststart",
        "demo/minimis.mp4",
      ]),
    );
  });
}

function card(seconds, output, filterPath) {
  return run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0xF4EFE6:s=1440x810:d=${seconds}:r=30`,
    "-filter_script:v",
    filterPath,
    "-frames:v",
    String(seconds * 30),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    output,
  ]);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}
