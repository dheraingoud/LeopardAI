import "dotenv/config";
import { generateText } from "ai";
import { getLanguageModel } from "@/lib/ai/providers";
import { UTILITY_MODEL } from "@/lib/nim";

async function main() {
  const t0 = Date.now();
  const r = await generateText({
    model: getLanguageModel(UTILITY_MODEL),
    prompt: "Reply with exactly: pong",
  });
  console.log(JSON.stringify({ model: UTILITY_MODEL, text: r.text, ms: Date.now() - t0, usage: r.usage }));
}
main();
