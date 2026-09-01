// @ts-nocheck
import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

async function main() {
  const { generateText } = await import("ai");
  const { getLanguageModel } = await import("../lib/ai/providers");
  const { webSearch } = await import("../lib/ai/tools/web-search");
  const r = await generateText({
    model: getLanguageModel("nvidia/nemotron-3.5-lightning-30b-a3b"),
    prompt: "What is Next.js? Answer in one sentence. Do NOT use tools.",
    tools: { webSearch: webSearch() },
    toolChoice: "none",
    maxOutputTokens: 200,
  });
  console.log("text:", JSON.stringify(r.text?.slice(0, 200)));
  console.log("finishReason:", r.finishReason, "toolCalls:", r.toolCalls?.length ?? 0);
  process.exit(0);
}
void main();
