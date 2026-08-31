import { chromium } from "playwright";

// Stop button: mid-stream click halts the answer, send button returns, and
// the partial text stays put (no rollback, no error state).
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill(
    "textarea",
    "Write a very long detailed essay (1000+ words) about the Amazon rainforest. Answer directly without using any tools.",
  );
  await page.keyboard.press("Enter");

  const stop = page.getByRole("button", { name: /stop generating/i });
  await stop.waitFor({ timeout: 30_000 });
  // Stop immediately — before tokens land — so the Stopped chip (which only
  // shows for empty trailing bubbles) engages.
  await stop.click();
  // Notice ("You stopped the response…") is SDK-injected and transient (the
  // detached server stream can replace the bubble) — sample, don't gate on it.
  await page.waitForTimeout(4000);

  const result = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      stoppedNotice: /stopped the response/i.test(body),
      tryAgain: Array.from(document.querySelectorAll("button")).some((b) =>
        /try again/i.test((b as HTMLElement).innerText),
      ),
      sendBack: !!document.querySelector("button[aria-label='Send message']"),
      caretGone: !document.querySelector(".leopard-stream-caret"),
    };
  });
  console.log(JSON.stringify(result));
  await page.screenshot({ path: "shots/stop.png" });
  await browser.close();
}
void main();
