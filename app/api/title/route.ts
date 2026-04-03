import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

/**
 * POST /api/title
 * Auto-generate chat title from the first user message using NIM API.
 */
export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    const apiKey = process.env.NVIDIA_API_KEY;

    if (!apiKey || !message) {
      // Fallback: use first few words
      const words = (message || "New Chat").split(" ").slice(0, 5);
      return NextResponse.json({ title: words.join(" ") });
    }

    const response = await fetch(`${NIM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "z-ai/glm-5",
        messages: [
          {
            role: "system",
            content:
              "Generate a concise 3-5 word title for this conversation. Reply with ONLY the title, nothing else. No quotes, no punctuation at the end.",
          },
          { role: "user", content: message },
        ],
        temperature: 0.3,
        max_tokens: 20,
        stream: false,
      }),
    });

    if (!response.ok) {
      const words = message.split(" ").slice(0, 5);
      return NextResponse.json({ title: words.join(" ") + "…" });
    }

    const data = await response.json();
    const title =
      data.choices?.[0]?.message?.content?.trim() || message.split(" ").slice(0, 5).join(" ");

    return NextResponse.json({ title });
  } catch {
    return NextResponse.json({ title: "New Chat" });
  }
}
