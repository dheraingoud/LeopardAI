import { NextRequest } from "next/server";

export const runtime = "edge";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

// System prompt to ensure proper code formatting for canvas previews
const SYSTEM_PROMPT = `You are Leopard, a high-performance AI assistant. Follow these rules:
- Always use fenced code blocks with language tags (e.g. \`\`\`jsx, \`\`\`html, \`\`\`python)
- For React components, use \`\`\`jsx and include all necessary imports
- For HTML, use \`\`\`html with complete valid markup
- For SVG, use \`\`\`svg
- Write clean, well-indented, production-quality code
- Be concise in explanations but thorough in code`;

// Timeouts per model speed tier
const FAST_TIMEOUT_MS = 30_000;
const SLOW_TIMEOUT_MS = 180_000;
const DEFAULT_TIMEOUT_MS = 60_000;

const FAST_MODELS = [
  "meta/llama-3.3-70b-instruct",
  "minimaxai/minimax-m2.5",
  "stepfun-ai/step-3.5-flash",
];

const SLOW_MODELS = [
  "z-ai/glm5",
  "qwen/qwen3.5-397b-a17b",
];

const FALLBACK_MODEL = "meta/llama-3.3-70b-instruct";

const MAX_MESSAGE_LENGTH = 32_000; // 32k chars per message
const MAX_MESSAGES = 100; // max messages per request

function getTimeout(model: string): number {
  if (FAST_MODELS.includes(model)) return FAST_TIMEOUT_MS;
  if (SLOW_MODELS.includes(model)) return SLOW_TIMEOUT_MS;
  return DEFAULT_TIMEOUT_MS;
}

export async function POST(req: NextRequest) {
  try {
    // Size limit: reject bodies > 500KB
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 512_000) {
      return Response.json({ error: "Request too large" }, { status: 413 });
    }

    const body = await req.json();
    const { messages, model, temperature = 0.6, maxTokens = 4096 } = body;

    if (!messages?.length) {
      return Response.json({ error: "messages array is required" }, { status: 400 });
    }

    // Input validation
    if (messages.length > MAX_MESSAGES) {
      return Response.json({ error: `Too many messages (max ${MAX_MESSAGES})` }, { status: 400 });
    }
    for (const msg of messages) {
      if (typeof msg.content !== "string" || msg.content.length > MAX_MESSAGE_LENGTH) {
        return Response.json({ error: "Message content too long" }, { status: 400 });
      }
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "NVIDIA_API_KEY not configured on server" }, { status: 500 });
    }

    // Map frontend short IDs to full NIM strings
    const MODEL_MAP: Record<string, string> = {
      "gemma-4-31b": "google/gemma-4-31b-it",
  "llama-3-70b": "meta/llama-3.3-70b-instruct",
      "step-3.5-flash": "stepfun-ai/step-3.5-flash",
      "minimax-m2.5": "minimaxai/minimax-m2.5",
      "kimi-k2.5": "moonshotai/kimi-k2.5",
      "deepseek-v3.2": "deepseek-ai/deepseek-v3.2",
      "qwen-300b": "qwen/qwen3.5-397b-a17b",
      "glm5": "z-ai/glm5"
    };

    const frontendModel = model || "llama-3-70b";
    const modelId = MODEL_MAP[frontendModel] || frontendModel || FALLBACK_MODEL;
    const timeout = getTimeout(modelId);

    // Inject system prompt as first message for better formatting
    const augmentedMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    const result = await callNIM(apiKey, modelId, augmentedMessages, temperature, maxTokens, timeout);

    // If the primary model timed out and isn't already the fallback, retry with fallback
    if (result.timedOut && modelId !== FALLBACK_MODEL) {
      console.log(`[/api/chat] ${modelId} timed out after ${timeout}ms, falling back to ${FALLBACK_MODEL}`);
      const fallbackResult = await callNIM(apiKey, FALLBACK_MODEL, messages, temperature, maxTokens, FAST_TIMEOUT_MS);
      if (fallbackResult.timedOut) {
        return Response.json(
          { error: "All models timed out. The API may be experiencing high load." },
          { status: 504 }
        );
      }
      if (fallbackResult.error) {
        return Response.json(
          { error: fallbackResult.error.message },
          { status: fallbackResult.error.status }
        );
      }
      // Prepend a notice about the fallback
      return streamWithNotice(fallbackResult.response!, modelId);
    }

    if (result.timedOut) {
      return Response.json(
        { error: "Model took too long to respond. Try a faster model like Llama 3.3 70B." },
        { status: 504 }
      );
    }

    if (result.error) {
      return Response.json(
        { error: result.error.message },
        { status: result.error.status }
      );
    }

    return streamResponse(result.response!);

  } catch (err) {
    console.error("[/api/chat] unhandled error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── Helper: make NIM API call ──────────────────────────────────────────
interface NIMResult {
  response?: Response;
  timedOut?: boolean;
  error?: { message: string; status: number };
}

async function callNIM(
  apiKey: string,
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
  timeout: number
): Promise<NIMResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const nimRes = await fetch(`${NIM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "text/event-stream",
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature,
        top_p: 1,
        max_tokens: maxTokens,
        stream: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!nimRes.ok) {
      const errText = await nimRes.text();
      console.error(`[/api/chat] NIM error ${nimRes.status}: ${errText.slice(0, 200)}`);
      return { error: { message: `Model API error (${nimRes.status})`, status: nimRes.status } };
    }

    return { response: nimRes };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return { timedOut: true };
    }
    throw err;
  }
}

// ─── Helper: stream NIM SSE response ────────────────────────────────────
function streamResponse(nimRes: Response): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const reader = nimRes.body?.getReader();
      if (!reader) { ctrl.close(); return; }

      let buffer = "";
      let hasStartedReasoning = false;
      let hasFinishedReasoning = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed === "data: [DONE]") {
              if (hasStartedReasoning && !hasFinishedReasoning) {
                 ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "\n</think>\n\n" })}\n\n`));
                 hasFinishedReasoning = true;
              }
              ctrl.enqueue(encoder.encode("data: [DONE]\n\n"));
              continue;
            }
            if (trimmed.startsWith("data: ")) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                const reason = json.choices?.[0]?.delta?.reasoning_content;
                const token = json.choices?.[0]?.delta?.content;
                
                let outputStr = "";
                
                if (reason) {
                  if (!hasStartedReasoning) {
                    outputStr += "<think>\n";
                    hasStartedReasoning = true;
                  }
                  outputStr += reason;
                }
                
                if (token !== undefined && token !== null) {
                  if (hasStartedReasoning && !hasFinishedReasoning) {
                    outputStr += "\n</think>\n\n";
                    hasFinishedReasoning = true;
                  }
                  outputStr += token;
                }

                if (outputStr) {
                  ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ content: outputStr })}\n\n`));
                }
              } catch { /* skip malformed chunk */ }
            }
          }
        }
      } catch (err) {
        console.error("[/api/chat] stream read error:", err);
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

// ─── Helper: stream with a fallback notice prepended ────────────────────
function streamWithNotice(nimRes: Response, originalModel: string): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const notice = `*[${originalModel} timed out — using Llama 3.3 70B instead]*\n\n`;

  const stream = new ReadableStream({
    async start(ctrl) {
      // Send the fallback notice first
      ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ content: notice })}\n\n`));

      const reader = nimRes.body?.getReader();
      if (!reader) { ctrl.close(); return; }

      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed === "data: [DONE]") {
              ctrl.enqueue(encoder.encode("data: [DONE]\n\n"));
              continue;
            }
            if (trimmed.startsWith("data: ")) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                const token = json.choices?.[0]?.delta?.content;
                if (token) {
                  ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ content: token })}\n\n`));
                }
              } catch { /* skip */ }
            }
          }
        }
      } catch (err) {
        console.error("[/api/chat] fallback stream error:", err);
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      "X-Accel-Buffering": "no",
    },
  });
}