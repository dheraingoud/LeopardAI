import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://localhost:3001/settings", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "shots/settings-profile.png" });
  // Appearance
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "shots/settings-appearance.png" });
  // light theme
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "shots/settings-light.png" });
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.waitForTimeout(500);
  // Models + Data + Danger
  for (const s of ["Models", "Data", "Danger"]) {
    await page.getByRole("button", { name: s, exact: true }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `shots/settings-${s.toLowerCase()}.png` });
  }
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  console.log(JSON.stringify({ ok: errors.length === 0, errors }));
  await browser.close();
}
void main();
