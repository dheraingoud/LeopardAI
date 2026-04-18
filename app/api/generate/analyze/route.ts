import { NextRequest } from "next/server";

export const runtime = "nodejs";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

const VISION_MODEL_MAP: Record<string, string> = {
  "llama-3.2-11b-vision": "meta/llama-3.2-11b-vision-instruct",
  "llama-3.2-90b-vision": "meta/llama-3.2-90b-vision-instruct",
  "phi-3-vision-128k": "microsoft/phi-3-vision-128k-instruct",
  "nemotron-nano-vl-8b": "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
};

async function parseBody(
  req: NextRequest,
): Promise<
  | {
      ok: true;
      body: {
        prompt?: string;
        imageUrl?: string;
        model?: string;
        maxTokens?: number;
      };
    }
  | { ok: false; response: Response }
> {
  try {
    const body = (await req.json()) as {
      prompt?: string;
      imageUrl?: string;
      model?: string;
      maxTokens?: number;
    };
    return { ok: true, body };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        response: Response.json({ error: "Invalid JSON payload" }, { status: 400 }),
      };
    }

    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "NVIDIA_API_KEY is not configured" }, { status: 500 });
    }

    const parsed = await parseBody(req);
    if (!parsed.ok) {
      return parsed.response;
    }

    const { body } = parsed;

    const prompt = (body.prompt || "").trim();
    const imageUrl = (body.imageUrl || "").trim();

    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const isRemoteImage = /^https?:\/\//.test(imageUrl);
    const isDataImage = /^data:image\//.test(imageUrl);
    if (!imageUrl || (!isRemoteImage && !isDataImage)) {
      return Response.json({ error: "A valid imageUrl or data:image payload is required" }, { status: 400 });
    }

    const model = VISION_MODEL_MAP[body.model || ""] || VISION_MODEL_MAP["llama-3.2-11b-vision"];

    const maxTokens = Number.isFinite(Number(body.maxTokens))
      ? Math.max(256, Math.min(4096, Number(body.maxTokens)))
      : 2048;

    const response = await fetch(`${NIM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "You are a concise visual analysis assistant. Return concrete observations and actionable insight.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
      }),
    });

    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      payload = { raw };
    }

    if (!response.ok) {
      return Response.json(
        {
          error: `Vision request failed (${response.status})`,
          details: payload,
        },
        { status: response.status },
      );
    }

    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const content = typeof message?.content === "string" ? message.content : "No analysis returned.";

    return Response.json({
      ok: true,
      model,
      analysis: content,
    });
  } catch (error) {
    console.error("[/api/generate/analyze] error", error);
    return Response.json({ error: "Failed to analyze image" }, { status: 500 });
  }
}
