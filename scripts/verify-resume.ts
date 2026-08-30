import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1365, height: 768 } })).newPage();
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill('[data-slot="composer-bar"] textarea', "Write a 6-line poem about leopards.");
  await page.click('[data-slot="composer-send"]');
  await page.waitForTimeout(12000); // mid-stream
  const url = page.url();
  console.log("chat url:", url);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const chip = await page.locator("text=generating").count();
  const body = await page.locator('[data-slot="message-pair"]').last().innerText().catch(() => "");
  console.log("generating chip:", chip > 0);
  console.log("bubble has content:", body.length > 20, "| len:", body.length);
  // let it finish, confirm completes without resend
  const t0 = Date.now();
  while (Date.now() - t0 < 240_000) {
    const c = await page.locator("text=generating").count();
    if (c === 0) break;
    await page.waitForTimeout(4000);
  }
  const final = await page.locator('[data-slot="message-pair"]').last().innerText();
  console.log("finished, final len:", final.length);
  await page.screenshot({ path: "../sweep/verify-resume.png" });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
