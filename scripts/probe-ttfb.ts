/* Time-to-first-chunk: raw SSE reader in page context vs DOM paint time. */
import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  // drive a real send, but instrument: patch performance marks around it
  await p.evaluate(() => {
    (window as any).__marks = [];
    const origFetch = window.fetch.bind(window);
    (window as any).__patch = true;
    window.fetch = async (...args: any[]) => {
      const isChat = String(args[0]).includes("/api/chat") && (args[1]?.method ?? "POST") === "POST";
      if (!isChat) return origFetch(...args as [any, any]);
      const t0 = performance.now();
      (window as any).__marks.push({ ev: "fetch-start", t: 0 });
      const res = await origFetch(...args as [any, any]);
      (window as any).__marks.push({ ev: "headers", t: performance.now() - t0 });
      const reader = res.body!.getReader();
      const wrapped = new ReadableStream({
        async pull(c) {
          const { done, value } = await reader.read();
          if (done) { c.close(); (window as any).__marks.push({ ev: "end", t: performance.now() - t0 }); return; }
          if (!(window as any).__firstByte) {
            (window as any).__firstByte = true;
            (window as any).__marks.push({ ev: "first-byte", t: performance.now() - t0 });
          }
          const s = new TextDecoder().decode(value);
          if (s.includes("text-delta") && !(window as any).__firstDelta) {
            (window as any).__firstDelta = true;
            (window as any).__marks.push({ ev: "first-text-delta", t: performance.now() - t0 });
          }
          c.enqueue(value);
        },
      });
      return new Response(wrapped, { status: res.status, statusText: res.statusText, headers: res.headers });
    };
  });
  const ta = p.locator("textarea").first();
  await ta.click();
  await ta.fill("In two sentences, what is amber?");
  const t0 = Date.now();
  await p.keyboard.press("Enter");
  // wait for visible assistant text
  let paintMs = -1;
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(250);
    const has = await p.evaluate(() => {
      const bodies = [...document.querySelectorAll(".markdown-body")];
      return bodies.some((el) => (el.textContent ?? "").trim().length > 20);
    });
    if (has) { paintMs = Date.now() - t0; break; }
  }
  await p.waitForTimeout(3000);
  const marks = await p.evaluate(() => (window as any).__marks);
  console.log(JSON.stringify({ marks, paintMs }, null, 2));
  await b.close();
})();
