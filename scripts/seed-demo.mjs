const base = process.env.DEMO_BASE || "http://127.0.0.1:3000";
const userId = "minimis-demo";

const body = {
  userId,
  replace: true,
  messages: [
    {
      id: "m-nov-q",
      role: "user",
      content: "Which Postgres hosts are a sensible default for a small app, and what do they charge?",
      timestamp: "2026-11-03T04:30:00.000Z",
    },
    {
      id: "m-nov-a",
      role: "assistant",
      content:
        "For Postgres hosting, Neon Launch is $19/month, Supabase Pro is $25/month, and the Render Postgres starter is $7/month.",
      timestamp: "2026-11-03T04:32:00.000Z",
    },
    {
      id: "m-mon-q",
      role: "user",
      content: "Shortlist 5 CRM tools for a 20-person sales team.",
      timestamp: "2026-11-09T03:30:00.000Z",
    },
    {
      id: "m-mon-a",
      role: "assistant",
      content:
        "Shortlist: HubSpot Starter at $20/user, Salesforce Starter at $25/user, Pipedrive Essential at $14/user, Close Startup at $9/user, Copper Starter at $29/user.",
      timestamp: "2026-11-09T03:32:00.000Z",
    },
  ],
  claims: [
    ["HubSpot", "$20/user", "https://www.hubspot.com/pricing"],
    ["Salesforce", "$25/user", "https://www.salesforce.com/pricing"],
    ["Pipedrive", "$14/user", "https://www.pipedrive.com/en/pricing"],
    ["Close", "$9/user", "https://www.close.com/pricing"],
    ["Copper", "$29/user", "https://www.copper.com/pricing"],
  ].map(([entity, value, sourceUrl], index) => ({
    id: `c-mon-${index + 1}`,
    messageId: "m-mon-a",
    entity,
    attribute: "price",
    value,
    asOf: "2026-11-09",
    sourceUrl,
  })),
};

const response = await fetch(`${base}/api/seed`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(payload.error || `Seed failed (${response.status}). Is npm run dev running?`);
  process.exit(1);
}

console.log(`Seeded ${payload.messages} messages for ${userId}.`);
console.log(`In the browser console: localStorage.setItem("minimis.user","${userId}")`);
console.log("Then reload http://localhost:3000/chat.html");
console.log("Ask: On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?");
