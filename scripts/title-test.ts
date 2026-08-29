import "dotenv/config"; import { config } from "dotenv"; config({ path: ".env.local" });
import { generateText } from "ai";
import { getTitleModel } from "@/lib/ai/providers";
(async () => {
  try {
    const { text } = await generateText({
      model: getTitleModel(),
      prompt: "say the word pineapple and nothing else",
      system: "Generate a 3-5 word chat title. No punctuation.",
    } as never);
    console.log("TITLE OK:", JSON.stringify(text));
  } catch (e) {
    console.error("TITLE FAIL:", String(e).slice(0, 400));
  }
})();
