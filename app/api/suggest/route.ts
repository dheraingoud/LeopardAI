import { generateText } from "ai";
import { allowedModelIds, getDefaultChatModel, getModelById } from "@/lib/ai/models";
import { getLanguageModel } from "@/lib/ai/providers";

// Suggested follow-up chips.
//
// Fired fire-and-forget by the client after an assistant message finishes
// streaming. Generates 3 short continuation questions from the just-completed
// assistant reply, so the user can tap a chip instead of typing. Ephemeral —
// suggestions are not persisted to Convex (they're a "what next" affordance,
// not durable chat content), so there's no schema migration.
//
// Degrades gracefully: if the model provider has no key (NIM needs
// NVIDIA_API_KEY, gateway needs AI_GATEWAY_API_KEY) or generation fails, it
// returns an empty list and the client renders no chips — never an error.

export const runtime = "nodejs";

const MAX_TEXT = 8000;
const MAX_SUGGESTIONS = 4;

const SUGGEST_PROMPT = `You are Leopard. I just answered a user's message in a chat app and gave the full reply already. Your ONLY job now: propose what the user is most likely to ask NEXT.

Output exactly 3 short follow-up questions (each at most 10 words). One per line. Do not number them, do not bullet them, do not quote them, do not add any preamble or closing text. They must be questions the user would plausibly send verbatim.`;

export async function POST(request: Request) {
  let body: { text?: string; modelId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const text = (body?.text ?? "").slice(0, MAX_TEXT).trim();
  if (!text) {
    return Response.json({ suggestions: [] });
  }

  const modelId =
    body?.modelId && allowedModelIds.has(body.modelId)
      ? body.modelId
      : getDefaultChatModel().id;
  const modelConfig = getModelById(modelId);

  if (modelConfig?.provider === "nim" && !process.env.NVIDIA_API_KEY) {
    return Response.json({ error: "no_key" }, { status: 503 });
  }
  if (modelConfig?.provider === "gateway" && !process.env.AI_GATEWAY_API_KEY) {
    return Response.json({ error: "no_key" }, { status: 503 });
  }

  try {
    const { text: out } = await generateText({
      model: getLanguageModel(modelId),
      instructions: SUGGEST_PROMPT,
      prompt: text,
      maxOutputTokens: 96,
    });

    const suggestions = out
      .split("\n")
      .map((line) =>
        line
          .replace(/^[-*\d.)\s]+/, "")
          .replace(/^["']|["']$/g, "")
          .trim(),
      )
      .filter(Boolean)
      .filter((s) => s.length > 1 && s.length <= 120)
      .slice(0, MAX_SUGGESTIONS);

    return Response.json({ suggestions });
  } catch {
    return Response.json({ suggestions: [] });
  }
}