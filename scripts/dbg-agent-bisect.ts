// @ts-nocheck
import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

async function main() {
  const { generateText, stepCountIs } = await import("ai");
  const { getLanguageModel } = await import("../lib/ai/providers");
  const { webSearch } = await import("../lib/ai/tools/web-search");
  const { webFetch } = await import("../lib/ai/tools/web-fetch");

  const cases: Array<[string, string, boolean]> = [
    ["muse-glimmer no-tools", "meta/muse-glimmer-30b", false],
    ["muse-glimmer with-tools", "meta/muse-glimmer-30b", true],
    ["nemotron with-tools", "nvidia/nemotron-3.5-lightning-30b-a3b", true],
  ];
  for (const [label, modelId, tools] of cases) {
    const t0 = Date.now();
    try {
      const r = await Promise.race([
        generateText({
          model: getLanguageModel(modelId),
          prompt: "Find one fact about Next.js 16 caching. Return it in one sentence.",
          ...(tools ? { tools: { webSearch: webSearch(), webFetch: webFetch({}) }, stopWhen: stepCountIs(5) } : {}),
          maxOutputTokens: 300,
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("TIMEOUT-45s")), 45_000)),
      ]);
      console.log(`${label}: OK ${(Date.now()-t0)/1000}s → ${r.text.slice(0, 80)}`);
    } catch (e) {
      console.log(`${label}: FAIL ${(Date.now()-t0)/1000}s → ${e instanceof Error ? e.message : e}`);
    }
  }
  process.exit(0);
}
void main();
