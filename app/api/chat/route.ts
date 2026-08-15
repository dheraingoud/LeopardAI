import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  generateText,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { auth } from "@clerk/nextjs/server";

import {
  nimReasoningProviderOptions,
  getCapabilities,
  getDefaultChatModel,
  getModelById,
  isImageModel,
  isVideoModel,
  resolveImageDimensions,
  type ImageAspectRatio,
} from "@/lib/ai/models";
import { systemPrompt, titlePrompt } from "@/lib/ai/prompts";
import { getLanguageModel, getTitleModel } from "@/lib/ai/providers";
import { allowedModelIds } from "@/lib/ai/models";
import { webFetch } from "@/lib/ai/tools/web-fetch";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

// ─── Runtime config (preserved from legacy route) ──────────────────────────────
export const runtime = "nodejs";
export const maxDuration = 300;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Append a single line to the dev debug log. Reads LEOPARD_DEBUG_LOG from env
// on every call so the route stays dev/prod-portable: writes are no-ops when
// the env var is unset (default for prod). Replaces the 4 previously hardcoded
// "<abs Windows path>" call sites so the route runs unchanged on Linux/macOS
// deploys, and so production silently disables the writes via env.
let _debugLogDir: string | null = null;
function appendDebugLog(line: string): void {
  const p = process.env.LEOPARD_DEBUG_LOG;
  if (!p) return; // not configured: skip (production default)
  try {
    const dir = require("node:path").dirname(p);
    if (dir !== _debugLogDir) {
      require("node:fs").mkdirSync(dir, { recursive: true });
      _debugLogDir = dir;
    }
    require("node:fs").appendFileSync(p, line + "\n");
  } catch {}
}

// Safe error-field accessors for unknown onError values (AI SDK v6's onError
// callback signature accepts unknown; raw `error?.message` access produces
// TS2339 with the inferred type `{}`).
function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
function errName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    return String((err as { name: unknown }).name);
  }
  return err instanceof Error ? err.name : "?";
}
function errStack(err: unknown): string {
  if (err instanceof Error) return err.stack ?? "";
  return "";
}
// `error.modelUsed` was used by an older debug logger format — preserved
// as a no-op accessor so the route-level onError block doesn't go empty.
function errModel(_err: unknown): string {
  return "?";
}

function getTextFromUIMessage(message: UIMessage): string {
  return ((message.parts ?? []) as Array<{ type: string; text?: string }>)
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("\n")
    .trim();
}

function lastUserMessage(messages: UIMessage[]): UIMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i];
  }
  return null;
}

function isFirstExchange(messages: UIMessage[]): boolean {
  const hasAssistant = messages.some((m) => m.role === "assistant");
  const hasUser = messages.some((m) => m.role === "user");
  return hasUser && !hasAssistant;
}

/** Generate a 3-5 word chat title from the first user message. */
async function generateTitleFromUserMessage(message: UIMessage): Promise<string> {
  const { text } = await generateText({
    model: getTitleModel(),
    // AI SDK v7: `system` → `instructions`.
    instructions: titlePrompt,
    prompt: getTextFromUIMessage(message),
  });
  return text
    .replace(/^[#*"\s]+/, "")
    .replace(/["]+$/, "")
    .trim();
}

/**
 * Φ8: image-gen branch. Reached only when the selected model is kind:"image"
 * (env-gated via NIM_IMAGE_MODELS — see POST §4). We bypass streamText entirely
 * (image models aren't language models) and instead call /api/generate/image —
 * the already-built endpoint with quota + fallback chains — then stream the
 * result back as a single assistant text part containing a markdown image.
 * ReactMarkdown renders it inline (components/chat/message.tsx); the client
 * persists via use-active-chat, which sanitizes the image markdown → a
 * placeholder + IndexedDB entry (lib/image-cache) so reloads resolve without
 * a base64/data-url in stored Convex text (the base64-loss fix).
 *
 * Aspect ratio is fixed at 1:1 here for Phase 8 (minimal structural wiring);
 * routing a client-chosen aspect through imageOptions is a Phase 9 follow-up.
 */
async function streamImageGeneration({
  request,
  messages,
  modelId,
  userId,
}: {
  request: Request;
  messages: UIMessage[];
  modelId: string;
  userId: string | null;
}): Promise<Response> {
  const lastUser = lastUserMessage(messages);
  const prompt = lastUser ? getTextFromUIMessage(lastUser) : "";
  if (!prompt) {
    return Response.json({ error: "empty_prompt" }, { status: 400 });
  }

  // Φ9 qwen-image-edit: pull the first image attachment off the last user
  // message and forward it as `editImage`. Multipart is AI SDK v6 — parts
  // can be {type:"file", url, mediaType:?}. NIM expects either a raw data URI
  // or a base64 string; the client uploads to /api/upload (lib/upload.ts)
  // which returns {url} as the data URI already, so we pass through.
  let editImage: string | undefined;
  if (lastUser && Array.isArray((lastUser as { parts?: unknown[] }).parts)) {
    const filePart = (lastUser as { parts: Array<{ type?: string; mediaType?: string; url?: string }> }).parts.find(
      (p) => p?.type === "file" && (p?.mediaType ?? "").startsWith("image/"),
    );
    editImage = filePart?.url || undefined;
  }

  // 1:1 default — see docstring re: Phase 9 aspect routing.
  const { width, height } = resolveImageDimensions("1:1" as ImageAspectRatio);
  // BYPASS_CLERK fallback owns the quota bucket; real Clerk userId binds in P9.
  const quotaUserId = userId ?? DEV_USER_ID;

  const imageResponse = await fetch(new URL("/api/generate/image", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model: modelId,
      userId: quotaUserId,
      width,
      height,
      ...(editImage ? { editImage } : {}),
    }),
  });

  const payload = (await imageResponse.json().catch(() => ({}))) as {
    url?: string;
    usage?: { used?: number; limit?: number };
    error?: string;
  };

  if (!imageResponse.ok || !payload.url) {
    return Response.json(
      { error: payload.error || "image_generation_failed" },
      { status: imageResponse.status || 500 },
    );
  }

  const remaining =
    typeof payload.usage?.limit === "number" && typeof payload.usage?.used === "number"
      ? Math.max(0, payload.usage.limit - payload.usage.used)
      : null;
  const quotaLine = remaining === null ? "" : `\n\n_Remaining generations today: ${remaining}_`;
  const body = `Generated image:\n\n![Generated image](${payload.url})${quotaLine}`;

  // Emit a single assistant text part (start/delta/end). Field is `delta` per
  // the AI SDK v6 UIMessage chunk schema (NOT `textDelta`).
  const stream = createUIMessageStream({
    execute: async ({ writer: dataStream }) => {
      const partId = generateId();
      dataStream.write({ type: "text-start", id: partId });
      dataStream.write({ type: "text-delta", id: partId, delta: body });
      dataStream.write({ type: "text-end", id: partId });
    },
    generateId,
  });

  return createUIMessageStreamResponse({ stream });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // 1. Parse + validate body.
  let body: PostRequestBody;
  try {
    const json = await request.json();
    body = postRequestBodySchema.parse(json) as PostRequestBody;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // 2. Clerk auth gate. leopard stores chats keyed by Clerk userId; reject
  //    unauthed requests. (Phase 9 hardens; Phase 4 just gates.)
  //    TEMP: Phase 5 browser E2E bypass — see lib/dev-user.ts. Revert before
  //    Phase 9. The route doesn't thread userId downstream (client owns
  //    persistence), so the bypass only needs to skip the 401.
  const { userId } = await auth();
  if (!userId && !BYPASS_CLERK) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // 3. Resolve model id → registry default if absent/unknown.
  const requested = body.model ?? getDefaultChatModel().id;
  const modelId = allowedModelIds.has(requested) ? requested : getDefaultChatModel().id;
  const modelConfig = getModelById(modelId);

  const messages = body.messages as UIMessage[];
  if (messages.length === 0) {
    return Response.json({ error: "messages array is required" }, { status: 400 });
  }

  // 4. Φ8: generation-only models route OUT of the streamText path.
  //
  //    Image-gen models (kind:"image") hit /api/generate/image and emit the
  //    result as a markdown image in a single assistant text part. Video-gen
  //    models (kind:"video") are DEFERRED — both live Cosmos models need a
  //    source-video upload (video understanding/transfer, NOT text→video),
  //    which is out of chat-prompt scope.
  //
  //    ENv-GATE: these ids only reach here when NIM_IMAGE_MODELS / NIM_VIDEO_MODELS
  //    expose them in getActiveModels() (filterByEnv). With neither env set →
  //    no gen id is in allowedModelIds → modelId falls to a text default → these
  //    branches never fire. Live model ids bind in Phase 9.

  if (isImageModel(modelId)) {
    return streamImageGeneration({ request, messages, modelId, userId });
  }

  if (isVideoModel(modelId)) {
    return Response.json(
      {
        error:
          "Video generation needs a source-video upload (Cosmos = video understanding/transfer, not text→video). Out of chat-prompt scope — use a text model.",
      },
      { status: 400 },
    );
  }

  // 5. NIM models need NVIDIA_API_KEY; gateway models need AI_GATEWAY_API_KEY.
  //    Pre-check NIM (local config) so a missing key surfaces as a clear 500
  //    instead of a 401 mid-stream.
  if (modelConfig?.provider === "nim" && !process.env.NVIDIA_API_KEY) {
    return Response.json(
      { error: "NVIDIA_API_KEY not configured on server" },
      { status: 500 },
    );
  }

  // 6. Capabilities → reasoning flag (drives sendReasoning + active tools in P6).
  const capabilities = await getCapabilities();
  const isReasoningModel = capabilities[modelId]?.reasoning === true;

  // 7. Convert the full UIMessage history → CoreMessage[] for streamText.
  const modelMessages = await convertToModelMessages(messages);

  // 8. Title gen: only on the first exchange (no assistant turn yet).
  const firstUser = isFirstExchange(messages) ? lastUserMessage(messages) : null;
  const titlePromise = firstUser ? generateTitleFromUserMessage(firstUser) : null;

  // 8b. Latest question text → drives auto-skill injection (diagram-clarity when
  //     the user asks for a diagram, math-typeset when asking for math).
  const promptContext = lastUserMessage(messages)?.parts
    ?.map((p) => (p.type === "text" ? p.text : ""))
    .join(" ");

  // 9. Build the UIMessage stream.
  const stream = createUIMessageStream({
      // TEMP-DBG: catch any error from streamText + merge so we see the actual
    execute: async ({ writer: dataStream }) => {
      // TEMP-DBG: catch any error from streamText + merge so we see the actual
      // upstream stack. The createUIMessageStream onError only catches errors
      // INSIDE the stream iteration; throws from streamText() or merge() bubble
      // to Next.js as 500. We need to know what's being thrown.
      // Typed via ReturnType<streamText<BuildTools>> — the actual shape varies
      // with the optional tools map; `any` lets the optional merge still work.
      let result: any;
      try {
        // Φ-enable-fetch: webFetch tool — server-side, http/https only,
        // 50 KB cap, 10 s timeout (forwarded route signal). Gated by
        // ENABLE_WEB_FETCH=1 so the model doesn't advertise a network tool in
        // dev builds that don't want it. stepCountIs(3) lets the model call
        // webFetch + emit a follow-up text response in the same stream.
        const webFetchEnabled = process.env.ENABLE_WEB_FETCH === "1";
        result = streamText({
        model: getLanguageModel(modelId),
        // `supportsTools` gates the artifact-style prompt block in prompts.ts.
        // With only webFetch active (no createDocument client), we pass the
        // canonical web-fetch prompt semantics — prompt.ts owns the wording.
        // AI SDK v7: `system` → `instructions`.
        instructions: systemPrompt({ requestHints: {}, supportsTools: webFetchEnabled, context: promptContext }),
        messages: modelMessages,
        // Cap output tokens — NIM rejects chat completions with no explicit
        // `max_tokens` (returns "Internal server error" / HTTP 500) since
        // 2026-07. 16384 fits within the smallest model context and matches
        // gateway defaults for comparable models. AI SDK v6 streams use
        // `maxOutputTokens` (NOT `maxTokens`).
        maxOutputTokens: 16384,
        providerOptions: {
          ...(modelConfig?.gatewayOrder && {
            gateway: { order: modelConfig.gatewayOrder },
          }),
          ...nimReasoningProviderOptions(modelConfig, body.reasoning),
        },
        ...(webFetchEnabled && {
          tools: {
            webFetch: webFetch({ dataStream }),
          },
          stopWhen: stepCountIs(3),
        }),
        });
      } catch (err) {
        try {
          require("node:fs").appendFileSync(
            process.env.LEOPARD_DEBUG_LOG ?? "",
            new Date().toISOString() +
              " streamText_THROW msg=" +
              String((err as Error)?.message ?? err) +
              " stack=" +
              String((err as Error)?.stack ?? "").slice(0, 4000) +
              "\n",
          );
          console.error("[/api/chat] streamText_THROW_MSG=", (err as Error)?.message ?? "");
        } catch {}
        throw err;
      }

      // Merge model stream → UI stream. sendReasoning surfaces reasoning parts
      // (NIM reasoning_content / gateway reasoning) for reasoning-capable models.
      try {
        const merged = result.toUIMessageStream({
          // Per user 2026-07-11 — disabled createDocument. Models over-triggered
          // on conversational prompts and the artifact became unwanted. Inline
          // is the default. Re-enable when a deliberate "save / draft" UX is wired.
          sendReasoning: isReasoningModel,
          onError: (err: unknown) => {
            try {
              require("node:fs").appendFileSync(
                process.env.LEOPARD_DEBUG_LOG ?? "",
                new Date().toISOString() +
                  " STREAM_onError model=" + modelId +
                  " msg=" + errMessage(err) +
                  " name=" + errName(err) +
                  "\n",
              );
            } catch {}
            console.error("[/api/chat] STREAM_onError", err);
          },
        });
        dataStream.merge(merged);
      } catch (err: unknown) {
        const e = err as Error;
        console.error(
          "[/api/chat] MERGE_THROW model=" + modelId +
            " msg=" + errMessage(err) +
            " stack=" + errStack(err),
        );
        try {
          const fs = require("node:fs");
          fs.appendFileSync(
            process.env.LEOPARD_DEBUG_LOG ?? "",
            new Date().toISOString() +
              " MERGE_THROW model=" + modelId +
              " msg=" + errMessage(err) +
              "\n",
          );
        } catch {}
        throw err;
      }

      // Emit a custom `data-chat-title` part so the Phase 5 client hook can
      // call api.chats.updateTitle. (No server-side Convex save — client owns
      // persistence; this route deliberately has no ConvexHttpClient.)
      if (titlePromise) {
        try {
          const title = await titlePromise;
          dataStream.write({ type: "data-chat-title", data: title });
        } catch {
          /* non-fatal — title is cosmetic */
        }
      }
    },
    generateId,
    onError: (error: unknown) => {
      try {
        require("node:fs").appendFileSync(
          process.env.LEOPARD_DEBUG_LOG ?? "",
          new Date().toISOString() +
            " ROUTE_onError model=" +
            errModel(error) +
            " msg=" +
            errMessage(error) +
            " stack=" +
            errStack(error).slice(0, 4000) +
            "\n=====\n",
        );
      } catch {}
      // Map known upstream errors to user-safe strings; never leak internals.
      if (error instanceof Error) {
        if (error.message.includes("AI Gateway requires a valid credit card")) {
          return "AI Gateway requires a valid credit card on file. See your Vercel AI settings.";
        }
        if (/401|unauthorized|api key/i.test(error.message)) {
          return "The selected model's API key is not configured on the server.";
        }
      }
      console.error("[/api/chat] stream error:", error);
      return "Oops, an error occurred while generating the response.";
    },
  });

  return createUIMessageStreamResponse({ stream });
}
