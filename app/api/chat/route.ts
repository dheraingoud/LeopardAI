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
  type ChatModel,
  type ImageAspectRatio,
} from "@/lib/ai/models";
import { isModelRequestAllowed } from "@/lib/ai/model-allowlist";
import { systemPrompt, titlePrompt } from "@/lib/ai/prompts";
import { getLanguageModel, getTitleModel } from "@/lib/ai/providers";
import { allowedModelIds } from "@/lib/ai/models";
import { webFetch } from "@/lib/ai/tools/web-fetch";
import { webSearch } from "@/lib/ai/tools/web-search";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";
import { type PostRequestBody, postRequestBodySchema } from "./schema";
import {
  backgroundServe,
  createGenerationController,
  isOverDailyTokenCap,
  recordAudit,
} from "@/lib/ai/server-generation";
import { redact } from "@/lib/redact";
import { parseApprovalRules, resolveApproval } from "@/lib/ai/tool-policy";

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
    // Redact secrets/file-paths/emails before it ever hits disk (data-usage).
    require("node:fs").appendFileSync(p, redact(line) + "\n");
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

  // Φ-docs: per-user daily token cap (LEOPARD_DAILY_TOKEN_CAP, off by default).
  // Fail-closed BEFORE burning any model spend once the operator-set budget is
  // exhausted. No admin key / cap unset → check is a no-op.
  if (await isOverDailyTokenCap(userId ?? DEV_USER_ID)) {
    return Response.json(
      { error: "daily_token_cap_reached", message: "Daily generation limit reached. Try again tomorrow." },
      { status: 429 },
    );
  }

  // 3. Resolve model id — fail LOUD on an explicit-but-disallowed model id.
  //    Absent → the trusted server default (getDefaultChatModel is always an
  //    active registry id). Present → must pass the operator allowlist
  //    (LEOPARD_ENABLED_MODELS layered over the active registry). The prior
  //    behavior SILENTLY downgraded an invalid id to the default — a typo'd or
  //    injected id ran on a different model than the client believed, and a
  //    crafted gateway id would route provider traffic once a key existed. 400
  //    with a clear message instead.
  let modelId: string;
  let modelConfig: ChatModel | undefined;
  const requestedModel = body.model;
  if (!requestedModel) {
    modelConfig = getDefaultChatModel();
    modelId = modelConfig.id;
  } else if (
    isModelRequestAllowed(
      requestedModel,
      allowedModelIds,
      process.env.LEOPARD_ENABLED_MODELS,
    )
  ) {
    modelId = requestedModel;
    modelConfig = getModelById(requestedModel);
  } else {
    return Response.json(
      {
        error: "model_not_allowed",
        message: `Model '${requestedModel}' is not enabled for this deployment.`,
      },
      { status: 400 },
    );
  }

  const messages = body.messages as UIMessage[];
  if (messages.length === 0) {
    return Response.json({ error: "messages array is required" }, { status: 400 });
  }

  // Φ10/#3: the assistant reply id must be present + we can't persist without a
  // valid Convex chat id (review m10). Body.id absent → fail loudly (400) rather
  // than silently disabling the background persistence the route is built on.
  if (!body.id || typeof body.id !== "string" || body.id.length === 0) {
    return Response.json({ error: "chat id is required" }, { status: 400 });
  }
  // Body.id is runtime-guaranteed non-empty string past the guard above; widen
  // to a definite string so the backgroundServe call below type-checks (the
  // schema keeps id optional, so TS can't narrow the parsed property here).
  const realChatId: string = body.id;

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
      // Φ10/#3 — assistant reply id + its abort controller, created BEFORE the
      // streamText call so (a) the signal can be wired in (review M1: abort =
      // deliberate stop or settle timeout, never reload), and (b) the id the
      // route broadcasts matches what backgroundServe persists. unregister on
      // settle is handled inside backgroundServe's done().finally().
      const assistantId = generateId();
      const genCtrl = createGenerationController(assistantId);
      try {
        // Φ-enable-fetch: webFetch + webSearch tools — server-side, gated by
        // env so the model doesn't advertise network tools in builds that
        // don't want them. webFetch needs ENABLE_WEB_FETCH=1; webSearch needs
        // ENABLE_WEB_SEARCH=1 AND a TAVILY_API_KEY. Each enabled tool lifts
        // supportsTools (drives the tool-usage prompt block — prompts.ts owns
        // wording). stepCountIs(3) lets the model search→fetch→reply in one
        // stream.
        const webFetchEnabled = process.env.ENABLE_WEB_FETCH === "1";
        const webSearchEnabled =
          process.env.ENABLE_WEB_SEARCH === "1" && !!process.env.TAVILY_API_KEY;
        const tools = {
          ...(webFetchEnabled ? { webFetch: webFetch({ dataStream }) } : {}),
          ...(webSearchEnabled ? { webSearch: webSearch() } : {}),
        };
        const supportsTools = webFetchEnabled || webSearchEnabled;

        // Sprint 2 — permission gating (deny→ask→allow). With
        // ENABLE_TOOL_APPROVAL=1, webFetch triggers a `tool-approval-request`
        // (client renders an AskCard → Allow/Deny → `tool-approval-response`
        // before the tool runs).
        //
        // Φ-docs (hooks/mcp): operator-declarative rules via TOOL_APPROVAL_RULES,
        // e.g. "webSearch=allow,webFetch=ask,^mcp__=deny" — per-tool regex
        // matchers with deny>allow>ask precedence (any deny vetoes). Global
        // TOOL_APPROVAL_POLICY (allow/deny/ask) remains; legacy default (ask)
        // still auto-approves the read-only webSearch. Rules unset → policy alone.
        const approvalEnabled = process.env.ENABLE_TOOL_APPROVAL === "1";
        const hadRules = process.env.TOOL_APPROVAL_RULES;
        const approvalRules = parseApprovalRules(hadRules);
        const approveAll =
          approvalEnabled && process.env.TOOL_APPROVAL_POLICY === "allow";
        const approveNone =
          approvalEnabled && process.env.TOOL_APPROVAL_POLICY === "deny";
        // Approval layer is active when tools are on + EITHER rules exist (their
        // deny veto must apply even under an otherwise-allow policy) OR the
        // legacy ask/deny policy is in effect.
        const approveOn =
          supportsTools && approvalEnabled && (approvalRules.length > 0 || !approveAll);

        const toolApprovalDecision = (toolName: string | undefined): "approved" | "denied" | "user-approval" => {
          const d = resolveApproval(
            toolName ?? "",
            approvalRules,
            approveNone ? "deny" : approveAll ? "allow" : "ask",
          );
          const decision = d.mode === "allow" ? "approved" : d.mode === "deny" ? "denied" : "user-approval";
          // Φ-docs: append the gate decision to the enterprise tool-audit trail
          // (who/what-tool/when/was-it-approved). Fire-and-forget; a failed
          // write is logged, never fatal to the stream.
          void recordAudit({
            assistantId,
            chatId: realChatId,
            userId: userId ?? DEV_USER_ID,
            event: "approval",
            toolName: toolName ?? "",
            decision,
            reason: d.reason,
          });
          return decision;
        };

        result = streamText({
        model: getLanguageModel(modelId),
        // Φ10/#3 — aborts only on deliberate stop / settle-timeout, NOT on the
        // request signal (reload/close must let the detached generation finish).
        // Tool streams inherit this controller, so a reload mid-webFetch no longer
        // tears down the in-flight fetch (review M2); an explicit stop does.
        abortSignal: genCtrl.signal,
        // `supportsTools` gates the artifact-style prompt block in prompts.ts.
        // With only webFetch active (no createDocument client), we pass the
        // canonical web-fetch prompt semantics — prompt.ts owns the wording.
        // AI SDK v7: `system` → `instructions`.
        instructions: systemPrompt({ requestHints: {}, supportsTools, context: promptContext }),
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
        ...(supportsTools && {
          tools,
          stopWhen: stepCountIs(3),
        }),
        // Φ-docs: enterprise tool-execution audit. onStepFinish fires once per
        // stream step; the `tool` step carries the toolCalls the model issued
        // and the toolResults the runner produced. We append a ROW PER EXECUTED
        // TOOL with redacted+truncated input + output summary. Approvals are
        // audited separately in toolApprovalDecision. Fire-and-forget.
        onStepFinish: (step: any) => {
          if (step?.stepType !== "tool") return;
          const calls: any[] = Array.isArray(step.toolCalls) ? step.toolCalls : [];
          const results: any[] = Array.isArray(step.toolResults) ? step.toolResults : [];
          if (calls.length === 0 && results.length === 0) return;
          for (const tc of calls) {
            const name = String(tc?.toolName ?? tc?.name ?? "");
            const input = tc?.input ?? tc?.args;
            const out = results.find(
              (r) => r?.toolCallId === tc?.toolCallId || r?.toolName === name,
            );
            const output = out?.result;
            const isError = !!output && typeof output === "object" && "error" in output;
            try {
              void recordAudit({
                assistantId,
                chatId: realChatId,
                userId: userId ?? DEV_USER_ID,
                event: isError ? "tool-error" : "tool-execution",
                toolName: name,
                inputJson: String(redact(JSON.stringify(input ?? null))).slice(0, 2000),
                outputSummary: String(
                  redact(typeof output === "string" ? output : JSON.stringify(output ?? "")),
                ).slice(0, 4000),
              });
            } catch {
              /* audit is best-effort */
            }
          }
        },
        // Sprint 2 / Φ-docs approval layer — delegating to the rules engine
        // (deny>allow>ask). Generic fn inspects the tool name; the typed param
        // is narrowed via the toolCall.
        ...(approveOn && {
          toolApproval: async ({
            toolCall,
          }: {
            toolCall?: { toolName?: string };
          }) => toolApprovalDecision(toolCall?.toolName),
        }),
        });
      } catch (err) {
        try {
          require("node:fs").appendFileSync(
            process.env.LEOPARD_DEBUG_LOG ?? "",
            new Date().toISOString() +
              " streamText_THROW msg=" +
              redact(String((err as Error)?.message ?? err)) +
              " stack=" +
              redact(String((err as Error)?.stack ?? "").slice(0, 4000)) +
              "\n",
          );
          console.error("[/api/chat] streamText_THROW_MSG=", (err as Error)?.message ?? "");
        } catch {}
        throw err;
      }

      // Φ10 / #3 — detached background generation. The streamText result is
      // handed to backgroundServe, which drives it to completion INDEPENDENT of
      // this HTTP request: it persists the assistant reply to Convex (progressive
      // `streaming` patches + a final `completed` patch) and broadcasts the live
      // UI-protocol chunks over an in-process bus. This SSE mirrors that bus to
      // the connected browser. If the page reloads/exits, the response aborts —
      // only this mirror stops; the detached task + model call + Convex writes
      // keep running, so the reply completes and is there on remount.
      const gen = backgroundServe({
        result,
        sendReasoning: isReasoningModel,
        assistantId,
        chatId: realChatId,
        userId: userId ?? DEV_USER_ID,
        model: modelId,
        abortController: genCtrl,
        settleTimeoutMs: maxDuration * 1000,
      });
      const unsubGen = gen.subscribe((chunk) => {
        try {
          // Mirror each protocol chunk (text-delta/reasoning-*/finish/error/…) to
          // the browser. Failures mean the browser is gone → drop the mirror only.
          dataStream.write(chunk as never);
        } catch {
          /* detached generation continues regardless */
        }
      });

      // Emit a custom `data-chat-title` part so the client hook can call
      // api.chats.updateTitle. (Title stays a client-owned side effect; this is
      // a cosmetic broadcast, not the Convex write path.)
      if (titlePromise) {
        try {
          const title = await titlePromise;
          dataStream.write({ type: "data-chat-title", data: title });
        } catch {
          /* non-fatal — title is cosmetic */
        }
      }

      // Keep this response open until the generation settles (so suspended SSE
      // flushes its buffered chunks), then release the mirror. The detached
      // task has already persisted by now, so release is safe even if the
      // browser closed mid-flight.
      try {
        await gen.done;
      } catch {
        /* the mirror may be gone; generation already persisted */
      }
      unsubGen();
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
            redact(errMessage(error)) +
            " stack=" +
            redact(errStack(error).slice(0, 4000)) +
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
