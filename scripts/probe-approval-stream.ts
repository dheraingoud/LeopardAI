/* Dump every /api/chat SSE chunk type for a webFetch-forcing prompt.
 * Goal: prove whether the server emits `tool-approval-request` at all. */
import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on("console", (m) => {
    const t = m.text();
    if (t.startsWith("[probe]")) console.log(t);
  });
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  await p.evaluate(() => {
    (window as any).__seen = new Set<string>();
    const origFetch = window.fetch.bind(window);
    window.fetch = async (...args: any[]) => {
      const isChat = String(args[0]).includes("/api/chat") && (args[1]?.method ?? "POST") === "POST";
      if (!isChat) return origFetch(...(args as [any, any]));
      const res = await origFetch(...(args as [any, any]));
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const wrapped = new ReadableStream({
        async pull(c) {
          const { done, value } = await reader.read();
          if (done) { c.close(); console.log("[probe] STREAM END"); return; }
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const ln of lines) {
            if (!ln.startsWith("data:")) continue;
            const payload = ln.slice(5).trim();
            if (payload === "[DONE]") { console.log("[probe] DONE marker"); continue; }
            try {
              const j = JSON.parse(payload);
              const ty = j.type ?? "?";
              const seen: Set<string> = (window as any).__seen;
              if (!seen.has(ty)) {
                seen.add(ty);
                console.log("[probe] chunk:", ty, ty.includes("tool") || ty.includes("approval") ? JSON.stringify(j).slice(0, 400) : "");
              }
            } catch { /* non-JSON */ }
          }
          c.enqueue(value);
        },
      });
      return new Response(wrapped, { status: res.status, statusText: res.statusText, headers: res.headers });
    };
  });
  const ta = p.locator("textarea").first();
  await ta.click();
  await ta.fill("Use the webFetch tool to fetch https://example.com — you MUST call the tool, do not answer from memory. Reply with the page's <h1> text only.");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(45000);
  console.log("[probe] seen:", JSON.stringify(await p.evaluate(() => [...(window as any).__seen])));
  await b.close();
})();
