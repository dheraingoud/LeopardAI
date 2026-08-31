/* Click Allow on the AskCard and trace the resume POST: request shape,
 * response status, and streamed chunk types. */
import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const posts: Array<{ n: number; status: number; chunks: string[] }> = [];
  let n = 0;
  p.on("response", async (res) => {
    if (!res.url().includes("/api/chat") || res.request().method() !== "POST") return;
    const my = ++n;
    const entry = { n: my, status: res.status(), chunks: [] as string[] };
    posts.push(entry);
    try {
      const body = res.request().postData() ?? "";
      const parsed = JSON.parse(body);
      const msgs = (parsed.messages ?? []) as Array<{ role?: string; parts?: unknown[] }>;
      console.log(`[post #${my}] OUT msgs=${msgs.length} roles=${msgs.map((m) => `${m.role}:${(m.parts ?? []).length}p`).join(",")}`);
      const lastM = msgs[msgs.length - 1];
      console.log(`[post #${my}] lastMsg parts:`, JSON.stringify(lastM?.parts ?? []).slice(0, 500));
    } catch (e) { console.log(`[post #${my}] body parse fail`, String(e).slice(0, 120)); }
    try {
      const text = await res.text();
      for (const ln of text.split("\n")) {
        if (!ln.startsWith("data:")) continue;
        const payload = ln.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          if (!entry.chunks.includes(j.type)) entry.chunks.push(j.type);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    console.log(`[post #${my}] status=${entry.status} chunks=${JSON.stringify(entry.chunks)}`);
  });
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 300)); });
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  const ta = p.locator("textarea").first();
  await ta.click();
  await ta.fill("Call the webFetch tool with url https://example.com right now. Do not answer from memory.");
  await p.keyboard.press("Enter");
  try {
    await p.waitForSelector("text=/^Allow$/i", { timeout: 75000 });
    console.log("[card] AskCard visible");
  } catch { console.log("[card] NO CARD"); await b.close(); return; }
  await p.getByRole("button", { name: /^allow$/i }).first().click();
  console.log("[click] Allow clicked");
  // wait for resumed content or timeout
  try {
    await p.waitForFunction(() => /Example Domain/i.test(document.body.innerText), undefined, { timeout: 90000 });
    console.log("[resume] SUCCESS — Example Domain visible");
  } catch { console.log("[resume] TIMEOUT — no Example Domain"); }
  console.log("posts:", posts.length);
  await b.close();
})();
