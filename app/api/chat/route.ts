import { NextRequest } from "next/server";
import { estimateTokens, getModelContextWindow, getContextBudget } from "@/lib/token-estimator";

export const runtime = "nodejs";
export const maxDuration = 300;

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

const SYSTEM_PROMPT = `You are Leopard, a high-performance AI assistant. Follow these rules:
- Always use fenced code blocks with language tags (e.g. \`\`\`jsx, \`\`\`html, \`\`\`python)
- For React components, use \`\`\`jsx and include all necessary imports
- For HTML, use \`\`\`html with complete valid markup
- For SVG, use \`\`\`svg
- For data payloads, use \`\`\`json
- Write clean, well-indented, production-quality code
- Be concise in explanations but thorough in code`;

const FAST_TIMEOUT_MS = 20_000;
const SLOW_TIMEOUT_MS = 45_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const STREAM_IDLE_TIMEOUT_MS = 20_000;
const STREAM_HEARTBEAT_MS = 10_000;

const MODEL_TIMEOUT_OVERRIDES: Record<string, number> = {
  "google/gemma-4-31b-it": 120_000,
};

const FALLBACK_MODEL = "meta/llama-3.3-70b-instruct";
const MAX_MESSAGE_LENGTH = 32_000;
const MAX_MESSAGES = 100;
const MAX_IMAGES_PER_MESSAGE = 4;

type ImageAspectRatio = "1:1" | "16:9" | "9:16" | "3:2" | "2:3" | "5:4" | "4:5";

const IMAGE_ASPECT_RATIO_SIZES: Record<ImageAspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1344, height: 768 },
  "9:16": { width: 768, height: 1344 },
  "3:2": { width: 1216, height: 832 },
  "2:3": { width: 832, height: 1216 },
  "5:4": { width: 1152, height: 896 },
  "4:5": { width: 896, height: 1152 },
};

const MODEL_MAP: Record<string, string> = {
  "gemma-4-31b": "google/gemma-4-31b-it",
  "llama-3-70b": "meta/llama-3.3-70b-instruct",
  "step-3.5-flash": "stepfun-ai/step-3.5-flash",
  "minimax-m2.5": "minimaxai/minimax-m2.5",
  "minimax-m2.7": "minimaxai/minimax-m2.7",
  "sd-3.5-large": "stabilityai/stable-diffusion-3_5-large",
  "flux-2-klein-4b": "black-forest-labs/flux_2-klein_4b",
  "stable-diffusion-xl-base": "stabilityai/sdxl",
  "kimi-k2.5": "moonshotai/kimi-k2.5",
  "deepseek-v3.2": "deepseek-ai/deepseek-v3.2",
  "qwen-300b": "qwen/qwen3.5-397b-a17b",
  "glm-5.1": "z-ai/glm-5.1",
  "llama-3.2-11b-vision": "meta/llama-3.2-11b-vision-instruct",
  "llama-3.2-90b-vision": "meta/llama-3.2-90b-vision-instruct",
  "nemotron-nano-vl-8b": "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
  "cosmos-reason2-8b": "nvidia/cosmos-reason2-8b",
  "cosmos-transfer2.5-2b": "nvidia/cosmos-transfer2_5-2b",
};

const FAST_MODELS = new Set([
  "meta/llama-3.3-70b-instruct",
  "minimaxai/minimax-m2.5",
  "minimaxai/minimax-m2.7",
  "stepfun-ai/step-3.5-flash",
  "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
]);

const SLOW_MODELS = new Set([
  "z-ai/glm-5.1",
  "qwen/qwen3.5-397b-a17b",
  "meta/llama-3.2-90b-vision-instruct",
  "nvidia/cosmos-transfer2_5-2b",
]);

const VISION_MODELS = new Set([
  "meta/llama-3.2-11b-vision-instruct",
  "meta/llama-3.2-90b-vision-instruct",
  "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
]);

const GENERATION_ONLY_MODELS = new Set([
  "stabilityai/stable-diffusion-3_5-large",
  "black-forest-labs/flux_2-klein_4b",
  "stabilityai/sdxl",
]);

const VIDEO_MODELS = new Set([
  "nvidia/cosmos-reason2-8b",
  "nvidia/cosmos-transfer2_5-2b",
]);

interface IncomingMessage {
  role: "system" | "user" | "assistant";
  content: string;
  imageUrls?: string[];
}

interface NIMResult {
  response?: Response;
  timedOut?: boolean;
  error?: { message: string; status: number };
}

interface TimedChunkResult {
  done: boolean;
  value?: Uint8Array;
  timedOut: boolean;
}

type MessageForNim =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "system" | "user" | "assistant";
      content: Array<
        { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
      >;
    };

function getTimeout(model: string): number {
  const override = MODEL_TIMEOUT_OVERRIDES[model];
  if (typeof override === "number") return override;
  if (FAST_MODELS.has(model)) return FAST_TIMEOUT_MS;
  if (SLOW_MODELS.has(model)) return SLOW_TIMEOUT_MS;
  return DEFAULT_TIMEOUT_MS;
}

function resolveModel(model?: string): string {
  if (!model) return FALLBACK_MODEL;
  return MODEL_MAP[model] || model;
}

function toSafeMessages(input: unknown): IncomingMessage[] {
  if (!Array.isArray(input)) return [];

  const output: IncomingMessage[] = [];
  for (const raw of input.slice(-MAX_MESSAGES)) {
    if (!raw || typeof raw !== "object") continue;

    const role =
      (raw as { role?: string }).role === "assistant"
        ? "assistant"
        : (raw as { role?: string }).role === "system"
          ? "system"
          : "user";

    const contentRaw = (raw as { content?: unknown }).content;
    if (typeof contentRaw !== "string") continue;

    const content = contentRaw.trim().slice(0, MAX_MESSAGE_LENGTH);
    const urlsRaw = (raw as { imageUrls?: unknown }).imageUrls;
    const imageUrls = Array.isArray(urlsRaw)
      ? urlsRaw
          .filter(
            (v): v is string =>
              typeof v === "string" && (/^https?:\/\//.test(v) || /^data:image\//.test(v)),
          )
          .slice(0, MAX_IMAGES_PER_MESSAGE)
      : [];

    output.push({ role, content, imageUrls: imageUrls.length > 0 ? imageUrls : undefined });
  }

  return output;
}

function buildNimMessages(messages: IncomingMessage[], modelId: string, maxContextTokens?: number): MessageForNim[] {
  const base: MessageForNim[] = [{ role: "system", content: SYSTEM_PROMPT }];
  const systemTokens = estimateTokens(SYSTEM_PROMPT) + 4;

  const budget = maxContextTokens ? Math.max(0, maxContextTokens - systemTokens) : Infinity;

  const isVision = VISION_MODELS.has(modelId);

  if (budget === Infinity) {
    // No budget constraint — include all messages
    for (const msg of messages) {
      if (isVision && msg.role === "user" && msg.imageUrls && msg.imageUrls.length > 0) {
        const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
        if (msg.content.trim().length > 0) parts.push({ type: "text", text: msg.content.trim() });
        for (const url of msg.imageUrls) parts.push({ type: "image_url", image_url: { url } });
        if (parts.length === 0) parts.push({ type: "text", text: "Describe the attached image(s)." });
        base.push({ role: msg.role, content: parts });
      } else {
        const imageContext = msg.imageUrls && msg.imageUrls.length > 0
          ? `\n\nAttached image URLs:\n${msg.imageUrls.map((url) => `- ${url}`).join("\n")}` : "";
        base.push({ role: msg.role, content: `${msg.content}${imageContext}`.trim() });
      }
    }
    return base;
  }

  // Budget-constrained: iterate from newest to oldest, keep what fits
  const indexed = messages.map((msg, i) => ({ msg, i, tokens: estimateTokens(msg.content) + 4 }));
  const selected: typeof indexed = [];
  let usedTokens = 0;
  const lastIndex = messages.length - 1;

  for (let j = indexed.length - 1; j >= 0; j--) {
    const entry = indexed[j];
    if (entry.i === lastIndex || usedTokens + entry.tokens <= budget) {
      selected.unshift(entry);
      usedTokens += entry.tokens;
    } else {
      break;
    }
  }

  if (selected.length < indexed.length) {
    const truncNotice = `[Note: ${indexed.length - selected.length} earlier messages were truncated to fit the model's context window.]`;
    base.push({ role: "system", content: truncNotice });
  }

  for (const entry of selected) {
    const msg = entry.msg;
    if (isVision && msg.role === "user" && msg.imageUrls && msg.imageUrls.length > 0) {
      const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
      if (msg.content.trim().length > 0) parts.push({ type: "text", text: msg.content.trim() });
      for (const url of msg.imageUrls) parts.push({ type: "image_url", image_url: { url } });
      if (parts.length === 0) parts.push({ type: "text", text: "Describe the attached image(s)." });
      base.push({ role: msg.role, content: parts });
    } else {
      const imageContext = msg.imageUrls && msg.imageUrls.length > 0
        ? `\n\nAttached image URLs:\n${msg.imageUrls.map((url) => `- ${url}`).join("\n")}` : "";
      base.push({ role: msg.role, content: `${msg.content}${imageContext}`.trim() });
    }
  }

  return base;
}

async function readChunkWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<TimedChunkResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader
        .read()
        .then((result) => ({ done: result.done, value: result.value, timedOut: false as const })),
      new Promise<TimedChunkResult>((resolve) => {
        timeoutId = setTimeout(() => resolve({ done: false, timedOut: true }), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function callNIM(
  apiKey: string,
  modelId: string,
  messages: MessageForNim[],
  temperature: number,
  maxTokens: number,
  timeout: number,
): Promise<NIMResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const nimRes = await fetch(`${NIM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
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
      console.error(`[/api/chat] NIM error ${nimRes.status}: ${errText.slice(0, 300)}`);
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

function streamResponse(nimRes: Response): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const reader = nimRes.body?.getReader();
      if (!reader) {
        ctrl.close();
        return;
      }

      const heartbeatId = setInterval(() => {
        try {
          ctrl.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // ignored: stream closed
        }
      }, STREAM_HEARTBEAT_MS);

      let buffer = "";
      let hasStartedReasoning = false;
      let hasFinishedReasoning = false;

      try {
        while (true) {
          const { done, value, timedOut } = await readChunkWithTimeout(reader, STREAM_IDLE_TIMEOUT_MS);
          if (timedOut) {
            await reader.cancel("upstream stream idle timeout");
            ctrl.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ content: "\n\n[Stream timed out on provider. Please retry.]" })}\n\n`,
              ),
            );
            ctrl.enqueue(encoder.encode("data: [DONE]\n\n"));
            break;
          }

          if (done) break;
          if (!value) continue;

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

            if (!trimmed.startsWith("data: ")) continue;

            try {
              const json = JSON.parse(trimmed.slice(6));
              const reason = json.choices?.[0]?.delta?.reasoning_content;
              const token = json.choices?.[0]?.delta?.content;

              let output = "";
              if (typeof reason === "string" && reason.length > 0) {
                if (!hasStartedReasoning) {
                  output += "<think>\n";
                  hasStartedReasoning = true;
                }
                output += reason;
              }

              if (typeof token === "string") {
                if (hasStartedReasoning && !hasFinishedReasoning) {
                  output += "\n</think>\n\n";
                  hasFinishedReasoning = true;
                }
                output += token;
              }

              if (output.length > 0) {
                ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ content: output })}\n\n`));
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      } catch (err) {
        console.error("[/api/chat] stream read error:", err);
      } finally {
        clearInterval(heartbeatId);
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

function streamWithNotice(nimRes: Response, noticeOrModel: string): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const notice = noticeOrModel.includes("*[")
    ? `${noticeOrModel}\n\n`
    : `*[${noticeOrModel} timed out - using Llama 3.3 70B instead]*\n\n`;

  const stream = new ReadableStream({
    async start(ctrl) {
      ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ content: notice })}\n\n`));

      const reader = nimRes.body?.getReader();
      if (!reader) {
        ctrl.close();
        return;
      }

      const heartbeatId = setInterval(() => {
        try {
          ctrl.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // ignored
        }
      }, STREAM_HEARTBEAT_MS);

      let buffer = "";
      try {
        while (true) {
          const { done, value, timedOut } = await readChunkWithTimeout(reader, STREAM_IDLE_TIMEOUT_MS);
          if (timedOut) {
            await reader.cancel("upstream fallback stream idle timeout");
            ctrl.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ content: "\n\n[Fallback model stream timed out. Please retry.]" })}\n\n`,
              ),
            );
            ctrl.enqueue(encoder.encode("data: [DONE]\n\n"));
            break;
          }

          if (done) break;
          if (!value) continue;

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

            if (!trimmed.startsWith("data: ")) continue;

            try {
              const json = JSON.parse(trimmed.slice(6));
              const token = json.choices?.[0]?.delta?.content;
              if (typeof token === "string" && token.length > 0) {
                ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ content: token })}\n\n`));
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      } catch (err) {
        console.error("[/api/chat] fallback stream error:", err);
      } finally {
        clearInterval(heartbeatId);
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

function streamSingleMessage(content: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
      ctrl.enqueue(encoder.encode("data: [DONE]\n\n"));
      ctrl.close();
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

function getLatestUserPrompt(messages: IncomingMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const candidate = messages[i];
    if (candidate.role === "user" && candidate.content.trim().length > 0) {
      return candidate.content.trim();
    }
  }

  return "";
}

function normalizeImageAspectRatio(input: unknown): ImageAspectRatio {
  if (typeof input !== "string") return "1:1";

  const ratio = input.trim() as ImageAspectRatio;
  if (ratio in IMAGE_ASPECT_RATIO_SIZES) {
    return ratio;
  }

  return "1:1";
}

function resolveImageDimensions(aspectRatio: ImageAspectRatio, requestedModel?: string) {
  const modelKey = (requestedModel || "").toLowerCase();

  // SDXL provider route currently supports square reliably in chat flow.
  if (modelKey.includes("stable-diffusion-xl")) {
    return { width: 1024, height: 1024 };
  }

  return IMAGE_ASPECT_RATIO_SIZES[aspectRatio] || IMAGE_ASPECT_RATIO_SIZES["1:1"];
}

function extractVideoSourceUrl(input: string): string | null {
  const markdownLinkMatch = input.match(/\((https?:\/\/[^)\s]+|data:video\/[^)\s]+)\)/i);
  if (markdownLinkMatch?.[1]) return markdownLinkMatch[1].trim();

  const dataUrlMatch = input.match(/data:video\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/i);
  if (dataUrlMatch?.[0]) return dataUrlMatch[0].trim();

  const urlMatches = input.match(/https?:\/\/[^\s)]+/gi) || [];
  for (const match of urlMatches) {
    const normalized = match.trim().replace(/[.,!?]$/, "");
    if (/(\.mp4|\.mov|\.webm|\.m3u8)(\?|$)/i.test(normalized) || /video/i.test(normalized)) {
      return normalized;
    }
  }

  return null;
}

function stripVideoSourceFromPrompt(input: string, source: string): string {
  return input
    .replace(source, "")
    .replace(/source\s*video\s*:\s*/gi, "")
    .replace(/video\s*url\s*:\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 512_000) {
      return Response.json({ error: "Request too large" }, { status: 413 });
    }

    const body = await req.json();
    const messages = toSafeMessages((body as { messages?: unknown }).messages);
    const requestedModel = (body as { model?: string }).model;
    const userId = (body as { userId?: string }).userId;
    const imageOptions = (body as { imageOptions?: { aspectRatio?: unknown } }).imageOptions;
    const temperature = Number((body as { temperature?: number }).temperature ?? 0.6);
    const maxTokens = Number((body as { maxTokens?: number }).maxTokens ?? 4096);

    if (messages.length === 0) {
      return Response.json({ error: "messages array is required" }, { status: 400 });
    }

    const modelId = resolveModel(requestedModel);

    const latestPrompt = getLatestUserPrompt(messages);
    if (!latestPrompt) {
      return Response.json({ error: "Latest user prompt is empty" }, { status: 400 });
    }

    if (GENERATION_ONLY_MODELS.has(modelId)) {
      const aspectRatio = normalizeImageAspectRatio(imageOptions?.aspectRatio);
      const { width, height } = resolveImageDimensions(aspectRatio, requestedModel);

      const imageResponse = await fetch(new URL("/api/generate/image", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: latestPrompt,
          model: requestedModel,
          userId,
          width,
          height,
        }),
      });

      const payload = (await imageResponse.json()) as {
        url?: string;
        usage?: { used?: number; limit?: number };
        error?: string;
      };

      if (!imageResponse.ok || !payload.url) {
        return Response.json(
          { error: payload.error || "Failed to generate image" },
          { status: imageResponse.status || 500 },
        );
      }

      const remaining =
        typeof payload.usage?.limit === "number" && typeof payload.usage?.used === "number"
          ? Math.max(0, payload.usage.limit - payload.usage.used)
          : null;

      const quotaLine = remaining === null ? "" : `\n\n_Remaining image generations today: ${remaining}_`;
      return streamSingleMessage(`Generated image:\n\n![Generated image](${payload.url})${quotaLine}`);
    }

    if (VIDEO_MODELS.has(modelId)) {
      const sourceVideoUrl = extractVideoSourceUrl(latestPrompt);
      if (!sourceVideoUrl) {
        return streamSingleMessage(
          "Video models stay in chat, but they require a source video URL or video data URL in your message.\n\n" +
            "Example:\n" +
            "https://example.com/clip.mp4\n" +
            "Make this clip cinematic and sharper.\n\n" +
            "For advanced controls, use:\n" +
            "- /app/playground/cosmos-reason2-8b\n" +
            "- /app/playground/cosmos-transfer2.5-2b",
        );
      }

      const strippedPrompt = stripVideoSourceFromPrompt(latestPrompt, sourceVideoUrl);
      const videoPrompt = strippedPrompt ||
        (modelId === "nvidia/cosmos-reason2-8b"
          ? "Analyze the source video for physical consistency."
          : "Generate a cinematic transfer from the source video.");

      const videoResponse = await fetch(new URL("/api/generate/video", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: videoPrompt,
          model: requestedModel,
          userId,
          sourceVideoUrl,
          question: modelId === "nvidia/cosmos-reason2-8b" ? videoPrompt : undefined,
        }),
      });

      const payload = (await videoResponse.json()) as {
        statusUrl?: string;
        error?: string;
      };

      if (!videoResponse.ok || !payload.statusUrl) {
        return Response.json(
          { error: payload.error || "Failed to queue video job" },
          { status: videoResponse.status || 500 },
        );
      }

      return streamSingleMessage(
        `Video job queued.\n\nTrack status: ${payload.statusUrl}`,
      );
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "NVIDIA_API_KEY not configured on server" }, { status: 500 });
    }

    const contextBudget = getContextBudget(getModelContextWindow(modelId));
  const nimMessages = buildNimMessages(messages, modelId, contextBudget);
    const timeout = getTimeout(modelId);

    const result = await callNIM(apiKey, modelId, nimMessages, temperature, maxTokens, timeout);

    if (result.timedOut && modelId !== FALLBACK_MODEL) {
      const fallbackMessages = buildNimMessages(messages, FALLBACK_MODEL, getContextBudget(getModelContextWindow(FALLBACK_MODEL)));
      const fallbackResult = await callNIM(
        apiKey,
        FALLBACK_MODEL,
        fallbackMessages,
        temperature,
        maxTokens,
        FAST_TIMEOUT_MS,
      );

      if (fallbackResult.timedOut) {
        return Response.json(
          { error: "All models timed out. The API may be experiencing high load." },
          { status: 504 },
        );
      }

      if (fallbackResult.error) {
        return Response.json(
          { error: fallbackResult.error.message, code: fallbackResult.error.status === 400 ? "CONTEXT_OVERFLOW" : undefined },
          { status: fallbackResult.error.status },
        );
      }

      return streamWithNotice(fallbackResult.response!, modelId);
    }

    if (result.timedOut) {
      return Response.json(
        { error: "Model took too long to respond. Try a faster model like Llama 3.3 70B." },
        { status: 504 },
      );
    }

    if (result.error) {
      if (result.error.status === 400) {
      const halfBudget = Math.floor(contextBudget * 0.5);
      const truncated = buildNimMessages(messages, modelId, halfBudget);
      const retry = await callNIM(apiKey, modelId, truncated, temperature, maxTokens, timeout);
      if (!retry.error && !retry.timedOut && retry.response) {
        return streamWithNotice(retry.response, `*[Context exceeded — using truncated history]*`);
      }
      return Response.json(
        { error: "Conversation too long for this model's context window.", code: "CONTEXT_OVERFLOW", suggestion: "Start a new conversation or compact this one." },
        { status: 400 },
      );
    }
    return Response.json({ error: result.error.message }, { status: result.error.status });
    }

    return streamResponse(result.response!);
  } catch (err) {
    console.error("[/api/chat] unhandled error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

