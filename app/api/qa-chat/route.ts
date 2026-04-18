import { NextRequest } from "next/server";

export const runtime = "nodejs";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

const MODEL_MAP: Record<string, string> = {
  "gemma-4-31b": "google/gemma-4-31b-it",
  "llama-3-70b": "meta/llama-3.3-70b-instruct",
  "step-3.5-flash": "stepfun-ai/step-3.5-flash",
  "minimax-m2.5": "minimaxai/minimax-m2.5",
  "minimax-m2.7": "minimaxai/minimax-m2.7",
  "kimi-k2.5": "moonshotai/kimi-k2.5",
  "deepseek-v3.2": "deepseek-ai/deepseek-v3.2",
  "qwen-300b": "qwen/qwen3.5-397b-a17b",
  "glm-5.1": "z-ai/glm-5.1",
};

async function parseBody(
  req: NextRequest,
): Promise<{ ok: true; body: { prompt?: string; model?: string } } | { ok: false; response: Response }> {
  try {
    const body = (await req.json()) as {
      prompt?: string;
      model?: string;
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
    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const model = MODEL_MAP[body.model || ""] || MODEL_MAP["llama-3-70b"];
    const startedAt = Date.now();

    const response = await fetch(`${NIM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.2,
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: "You are a QA helper. Be concise and deterministic where possible.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const raw = await response.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = { raw };
    }

    if (!response.ok) {
      return Response.json(
        {
          error: `Provider error (${response.status})`,
          details: payload,
        },
        { status: response.status },
      );
    }

    const choices =
      payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).choices)
        ? ((payload as Record<string, unknown>).choices as Array<Record<string, unknown>>)
        : [];

    const answer =
      typeof choices[0]?.message === "object" && choices[0]?.message
        ? ((choices[0].message as Record<string, unknown>).content as string | undefined)
        : undefined;

    return Response.json({
      ok: true,
      model,
      latencyMs: Date.now() - startedAt,
      response: answer || "",
      raw: payload,
    });
  } catch (error) {
    console.error("[/api/qa-chat] error", error);
    return Response.json({ error: "QA request failed" }, { status: 500 });
  }
}
