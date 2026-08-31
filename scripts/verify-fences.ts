import { chromium } from "playwright";

// One chat, three structured fences: table (CSV), spec (JSON fields), diff.
// Asserts each settles into its component (DataTable / SpecSheet / CodeDiff)
// and survives reload.
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill(
    "textarea",
    [
      "Reply with ONLY these three code fences, nothing else:",
      "```table",
      "Name,Weight",
      "Tiger,220",
      "Lion,190",
      "```",
      "```spec",
      '{"title":"Leopard","fields":[{"label":"Speed","value":"58 km/h"},{"label":"Mass","value":"60 kg"}]}',
      "```",
      "```diff",
      "--- a/cats.txt",
      "+++ b/cats.txt",
      "@@ -1 +1 @@",
      "-lion",
      "+leopard",
      "```",
    ].join("\n"),
  );
  await page.keyboard.press("Enter");

  const deadline = Date.now() + 300_000;
  let live = { table: false, spec: false, diff: false };
  while (Date.now() < deadline) {
    live = await page.evaluate(() => ({
      table: !!document.querySelector("[data-slot='data-table']"),
      spec: !!document.querySelector("[data-slot='spec-sheet']"),
      diff: !!document.querySelector("[data-slot='code-diff']"),
    }));
    if (live.table && live.spec && live.diff) break;
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: "shots/fences.png" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  const reloaded = await page.evaluate(() => ({
    table: !!document.querySelector("[data-slot='data-table']"),
    spec: !!document.querySelector("[data-slot='spec-sheet']"),
    diff: !!document.querySelector("[data-slot='code-diff']"),
  }));
  console.log(JSON.stringify({ live, reloaded }));
  await browser.close();
}
void main();
