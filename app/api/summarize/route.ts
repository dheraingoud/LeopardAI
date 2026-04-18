import { NextRequest } from "next/server";

export const runtime = "nodejs";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const SUMMARIZE_MODEL = "minimaxai/minimax-m2.5";
const SUMMARIZE_TIMEOUT = 15_000;

const SUMMARIZE_SYSTEM_PROMPT = `You are a concise conversation summarizer. Summarize the following conversation in 200-400 words. Preserve key decisions, code changes, the user's goal, and any important technical details. Omit pleasantries and repetition. Output only the summary, no preamble.`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "NVIDIA_API_KEY not configured" }, { status: 500 });
    }

    const body = (await req.json()) as {
      messages?: Array<{ role: string; content: string }>;
    };

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages array is required" }, { status: 400 });
    }

    const conversationText = messages
      .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
      .join("\n\n---\n\n");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SUMMARIZE_TIMEOUT);

    try {
      const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: SUMMARIZE_MODEL,
          messages: [
            { role: "system", content: SUMMARIZE_SYSTEM_PROMPT },
            { role: "user", content: conversationText },
          ],
          temperature: 0.3,
          max_tokens: 1024,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[/api/summarize] NIM error ${res.status}: ${errText.slice(0, 200)}`);
        return Response.json({ error: `Summarization failed (${res.status})` }, { status: res.status });
      }

      const payload = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const summary = payload.choices?.[0]?.message?.content?.trim();
      if (!summary) {
        return Response.json({ error: "No summary generated" }, { status: 502 });
      }

      return Response.json({ summary, model: SUMMARIZE_MODEL });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        return Response.json({ error: "Summarization timed out" }, { status: 504 });
      }
      throw err;
    }
  } catch (err) {
    console.error("[/api/summarize] error:", err);
    return Response.json({ error: "Failed to summarize" }, { status: 500 });
  }
}
