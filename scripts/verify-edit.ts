/* Edit-flow E2E: send → settle → edit the user message → resend → settle.
 * Pass: exactly ONE user bubble (right-aligned container) at every step. */
import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await p.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);

  // Count only right-aligned USER bubbles containing the needle.
  const userBubbleCount = async (needle: string) =>
    p.evaluate((n) => {
      const scope = document.querySelector(".max-w-3xl") ?? document.body;
      let count = 0;
      for (const el of scope.querySelectorAll("div.items-end")) {
        const t = (el as HTMLElement).innerText?.trim() ?? "";
        if (t.includes(n)) count++;
      }
      return count;
    }, needle);

  // Wait until the SDK reports ready (text-stability false-positives on
  // long thinking pauses — that race is exactly what broke Enter before).
  const settle = async () => {
    // __composer debug hook is gone post-commit — fall back to text stability
    // with a long sample window (thinking pauses can exceed 1.5s).
    let last = "";
    for (let i = 0; i < 80; i++) {
      await p.waitForTimeout(2000);
      const cur = await p.evaluate(() => document.body.innerText);
      if (cur === last && cur.length > 0) return;
      last = cur;
    }
  };

  const ta = p.locator("form textarea").first();
  await ta.click();
  await ta.fill("alpha-unique-111 say hello there friend");
  await ta.press("Enter");
  await p.waitForFunction(
    () => [...document.querySelectorAll(".markdown-body")].some((el) => (el.textContent ?? "").trim().length > 0), undefined, { timeout: 120000 },
  );
  await settle();
  console.log("before edit:", await userBubbleCount("alpha-unique-111 say hello there friend"));

  // hover the user bubble to reveal actions, click Edit
  const bubble = p.locator("div.items-end", { hasText: "alpha-unique-111" }).last();
  await bubble.hover();
  await p.getByRole("button", { name: /edit/i }).first().click();
  await p.waitForTimeout(800);
  console.log("during edit:", await userBubbleCount("alpha-unique-111 say hello there friend"),
    "composer:", (await ta.inputValue()).slice(0, 40));

  let postCount = 0;
  p.on("request", (r) => {
    if (r.url().includes("/api/chat") && r.method() === "POST") {
      postCount++;
      console.log("[net] POST #", postCount, (r.postData() ?? "").slice(0, 160));
    }
  });
  p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 200)); });
  await ta.click();
  await ta.fill("alpha-unique-222 say hello there friend");
  await ta.press("Enter");
  await p.waitForTimeout(2000);
  console.log("composer after Enter:", JSON.stringify(await ta.inputValue()));
  console.log("composer state:", await p.evaluate(() => JSON.stringify((window as any).__composer)));
  console.log("page state:", await p.evaluate(() => ({
    textareas: document.querySelectorAll("textarea").length,
    stopBtn: !!document.querySelector("[aria-label*='top' i]"),
    caret: !!document.querySelector(".leopard-stream-caret"),
    thinking: document.body.innerText.includes("Thinking"),
    submitDisabled: (document.querySelector("button[type='submit']") as HTMLButtonElement | null)?.disabled,
  })));
  await p.waitForFunction(
    () => [...document.querySelectorAll(".markdown-body")].some((el) => (el.textContent ?? "").trim().length > 0), undefined, { timeout: 120000 },
  ).catch(() => {});
  await settle();
  const afterOld = await userBubbleCount("alpha-unique-111 say hello there friend");
  const afterNew = await userBubbleCount("alpha-unique-222 say hello there friend");
  console.log("after resend: old=", afterOld, "new=", afterNew);
  console.log(JSON.stringify({
    pass: afterOld === 0 && afterNew === 1,
    errors: errors.slice(0, 4),
  }));
  await p.screenshot({ path: "../verify-edit.png" });
  await b.close();
})();
