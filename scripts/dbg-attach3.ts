// @ts-nocheck — which request 500s during attach?
import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  p.on("response", async (r) => {
    if (r.status() >= 400) console.log(`[${r.status()}] ${r.request().method()} ${r.url()}`, (await r.text().catch(() => "")).slice(0, 300));
  });
  await p.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  await p.locator('[data-slot="composer-bar"] textarea').waitFor({ timeout: 60_000 });
  await p.locator('button[aria-label="Add attachment"]').click();
  await p.locator('[data-slot="composer-bar"] input[type="file"]').last().setInputFiles("C:/Users/HP/leopard-shots/probe-note.txt");
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(1000);
    const chips = await p.locator('[data-slot="attachment-chip"]').count();
    const uploading = await p.locator("text=uploading").count();
    console.log(`t+${i + 1}s chips=${chips} uploading=${uploading}`);
    if (chips > 0) break;
  }
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
