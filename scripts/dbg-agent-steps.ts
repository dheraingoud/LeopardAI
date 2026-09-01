// @ts-nocheck
import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

async function main() {
  const { generateText, stepCountIs } = await import("ai");
  const { getLanguageModel } = await import("../lib/ai/providers");
  const { webSearch } = await import("../lib/ai/tools/web-search");
  const { webFetch } = await import("../lib/ai/tools/web-fetch");
  const r = await generateText({
    model: getLanguageModel("nvidia/nemotron-3.5-lightning-30b-a3b"),
    system: "You are a research subagent. Use web search. Return concise findings.",
    prompt: "Task: Find one fact about Next.js 16 caching.",
    tools: { webSearch: webSearch(), webFetch: webFetch({}) },
    stopWhen: stepCountIs(6),
    prepareStep: ({ stepNumber }) => (stepNumber >= 5 ? { toolChoice: "none" } : {}),
    maxOutputTokens: 1500,
  });
  console.log("text:", JSON.stringify(r.text?.slice(0, 300)));
  console.log("finishReason:", r.finishReason, "steps:", r.steps.length);
  for (const s of r.steps) {
    console.log(" step:", s.finishReason, "text:", JSON.stringify((s.text ?? "").slice(0, 80)), "tools:", s.toolCalls.map((t) => t.toolName).join(","), "toolResults:", (s.toolResults ?? []).map((tr) => JSON.stringify(tr.output ?? tr.result ?? "").slice(0, 60)).join("|"));
  }
  process.exit(0);
}
void main();
