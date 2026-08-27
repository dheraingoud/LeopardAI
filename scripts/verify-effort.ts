/* Per-chat reasoning effort — BADGE-level proof: seed chat-scoped
 * localStorage keys, reload each chat, read the effort chip on the reasoning
 * panel. A must show HIGH, B must show LOW (cross-chat leak = fail). */
import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));
  const [idA, idB] = ["j572shwfp9fm9kw6030yrc1pb18d76f3", "j57a0nv590wxhrzw6mwfvqrx8n8d6gc4"];

  const badgeOn = async (chatId: string) => {
    await p.goto(`http://localhost:3001/chat/${chatId}`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(4000);
    return p.evaluate(() => {
      const labels = ["off", "on", "low", "medium", "high", "max"];
      const chips = [...document.querySelectorAll("span, div")]
        .filter((el) => {
          const t = (el.textContent ?? "").trim().toLowerCase();
          return labels.includes(t) && el.children.length === 0 && t.length <= 6;
        })
        .map((el) => (el.textContent ?? "").trim().toLowerCase());
      return chips;
    });
  };

  await p.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  await p.evaluate(([a, bId]) => {
    localStorage.setItem(`leopard:reasoning:${a}:moonshotai/kimi-k3`, "high");
    localStorage.setItem(`leopard:reasoning:${bId}:moonshotai/kimi-k3`, "low");
    localStorage.setItem("leopard:reasoning:moonshotai/kimi-k3", "medium"); // model default — must NOT win
  }, [idA, idB]);

  const aChips = await badgeOn(idA);
  const bChips = await badgeOn(idB);
  const aHigh = aChips.includes("high");
  const bLow = bChips.includes("low");
  console.log(JSON.stringify({ aChips, bChips, aHigh, bLow, pass: aHigh && bLow && !aChips.includes("low") && !bChips.includes("high") }));
  await b.close();
})();
