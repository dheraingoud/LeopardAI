// @ts-nocheck
import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  await p.locator('[data-slot="composer-bar"] textarea').waitFor({ timeout: 60_000 });
  const out = await p.evaluate(async () => {
    const r = { fetchMs: -1, fetchStatus: -1, jsonErr: "", dataUrlLen: -1 };
    try {
      const blob = new Blob(["hello"], { type: "text/plain" });
      const f = new File([blob], "t.txt", { type: "text/plain" });
      const fd = new FormData();
      fd.append("file", f);
      const t0 = performance.now();
      const res = await fetch("/api/files/upload", { method: "POST", body: fd });
      r.fetchMs = Math.round(performance.now() - t0);
      r.fetchStatus = res.status;
      try { await res.json(); } catch (e) { r.jsonErr = String(e).slice(0, 120); }
      const dataUrl = await new Promise((res2, rej) => {
        const rd = new FileReader();
        rd.onload = () => res2(String(rd.result));
        rd.onerror = () => rej(rd.error);
        rd.readAsDataURL(f);
      });
      r.dataUrlLen = (dataUrl as string).length;
    } catch (e) { r.jsonErr = "OUTER: " + String(e).slice(0, 120); }
    return r;
  });
  console.log(JSON.stringify(out));
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
