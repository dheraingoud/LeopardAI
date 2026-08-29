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
import { createDocument } from "@/lib/ai/tools/create-document";
import { loadMcpTools } from "@/lib/ai/mcp";
import { compactMessages, clampCompactThreshold, type Summarizer } from "@/lib/context-manager";
import { resolveOutputStyleDirective } from "@/lib/ai/output-styles";
import { estimateConversationTokens, getContextBudget, type TokenMessage } from "@/lib/token-estimator";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";
import { type PostRequestBody, postRequestBodySchema } from "./schema";
import {
  backgroundServe,
  createGenerationController,
  isOverDailyTokenCap,
  listUserMemories,
  persistChatTitle,
  semanticRankMemories,
  recordAudit,
  type UserMemory,
} from "@/lib/ai/server-generation";
import { memoryTools } from "@/lib/ai/tools/memory";
import { researchTools } from "@/lib/ai/tools/research";
import { buildFallbackModelChain, isFallbackableErrorText } from "@/lib/ai/fallback";
import { chatUsageTelemetry } from "@/lib/ai/telemetry";
import { redact, scrubAuditField } from "@/lib/redact";
import { parseApprovalRules, resolveApproval } from "@/lib/ai/tool-policy";
import { internalHeaders } from "@/lib/api/guard";

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

/**
 * Φ-latency · T4: NIM rejects an assistant whose content is only reasoning/empty
 * ("Empty content is not allowed for assistant messages" → 400). A force-settled
 * reasoning-only turn (max-effort think that never reached a text answer) leaves
 * such a row in history, and EVERY later turn re-sends it → the recurring 400.
 * Browser history also carries `tool` parts whose `state` is "approval-requested"
 * (an AskCard for a tool the turn didn't answer). Both are meaningful to the UI
 * but must NOT ride as model messages — the provider can't serialize them.
 * Reasoning is ephemeral (the final text/tool-call is the context that matters),
 * so dropping trailing thought-only assistant blocks is safe. Keep any assistant
 * with a real text answer, a tool-call, a tool-result, or a tool-approval.
 */
function hasModelWorthyAssistantContent<
  T extends { role?: string; content?: unknown },
>(m: T): boolean {
  if (m.role !== "assistant") return true;
  const c = m.content;
  if (typeof c === "string") return c.trim().length > 0;
  if (!Array.isArray(c)) return true;
  return c.some(
    (p: unknown) =>
      (p as { type?: string })?.type === "tool-call" ||
      (p as { type?: string })?.type === "tool-result" ||
      (p as { type?: string })?.type === "tool-approval-request" ||
      ((p as { type?: string; text?: string })?.type === "text" &&
        typeof (p as { text?: string }).text === "string" &&
        ((p as { text?: string }).text ?? "").trim().length > 0),
  );
}

/** Flatten a model message's content (string or part array) to text for token
 * estimation — mirrors TokenMessage for estimateConversationTokens. */
function modelMessagesToTokenInput(
  msgs: Array<{ role?: string; content?: unknown }>,
): TokenMessage[] {
  return msgs.map((m) => {
    const c = m.content;
    let text = "";
    if (typeof c === "string") text = c;
    else if (Array.isArray(c)) {
      text = c
        .filter((p: unknown) => (p as { type?: string })?.type === "text")
        .map((p) => (p as { text?: string }).text ?? "")
        .join("\n");
    }
    return { role: m.role ?? "user", content: text };
  });
}

/**
 * Φ-latency · T1: bound NIM input PREFILL — the model-speed-INDEPENDENT latency
 * driver. A long chat re-sends the full transcript every turn, so prefill time
 * grows with history no matter how "flash" the model is. When history exceeds
 * the model's budget, drop the OLDEST non-tool messages from the front (never
 * the newest user question, never a tool/tool-result — that would orphan the
 * tool-call pairing). No-op when under budget or anything is ambiguous (fail-
 * simple: keep the full history).
 */
function trimModelMessagesToBudget<
  T extends { role?: string; content?: unknown },
>(msgs: T[], budget: number): T[] {
  if (!(budget > 0) || msgs.length <= 1) return msgs;
  let trimmed = msgs;
  let guard = 0;
  while (
    estimateConversationTokens(modelMessagesToTokenInput(trimmed)) > budget &&
    trimmed.length > 1 &&
    guard++ < 500
  ) {
    const first = trimmed[0] as { content?: unknown };
    const isTool =
      (Array.isArray(first.content) &&
        first.content.some(
          (p: unknown) =>
            (p as { type?: string })?.type === "tool-call" ||
            (p as { type?: string })?.type === "tool-result",
        )) ||
      (typeof first.content === "string" &&
        /tool|structured-content|json-schema/.test(first.content));
    if (isTool) break; // preserve tool-call ↔ tool-result pairing
    trimmed = trimmed.slice(1);
  }
  return trimmed.length === msgs.length ? msgs : trimmed;
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
    // Φ-docs · internal service token so the fail-closed media gate recognizes
    // this server-initiated call (this route already passed Clerk auth()).
    headers: internalHeaders(),
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

  // 6b. Φ-docs: automatic context compaction (LEOPARD_CONTEXT_COMPACT=1, OFF by
//     default → zero behavior change unless an operator opts in). When the
//     history nears the model window, fold the older ~60% into a summary via
//     /api/summarize (falling back to a pure sliding window), keeping the tail.
//     Fail-open: any compaction error keeps the FULL history. A folded summary
//     is broadcast (data-compaction) so the UI can surface it.
  let modelMessages = await convertToModelMessages(messages);
  let compactedSummary: string | undefined;
  if (process.env.LEOPARD_CONTEXT_COMPACT === "1") {
    const contextWindow = modelConfig?.contextWindow ?? 128_000;
    try {
      const tokenMsgs: TokenMessage[] = messages.map((m) => {
        const parts = (m.parts ?? []) as Array<{ type?: string; text?: string }>;
        const text = parts
          .filter((p) => p.type === "text" || p.type === "reasoning")
          .map((p) => p.text ?? "")
          .join("\n");
        return { role: m.role ?? "user", content: text };
      });
      const usedTokens = estimateConversationTokens(tokenMsgs);
      const budget = getContextBudget(contextWindow);
      // Addon B: configurable threshold (defaults to the original 85%) so an
      // operator can compact earlier/later per model. Clamped to a sane band.
      const compactAt = clampCompactThreshold(Number(process.env.LEOPARD_CONTEXT_COMPACT_AT) || 0.85);
      if (budget > 0 && usedTokens > budget * compactAt) {
        // Addon B: server-side summarizer — the default browser fetch cannot
        // reach /api/summarize from Node, so we inject one that targets this
        // origin. Also threads the (optional) user focus through.
        const origin = new URL(request.url).origin;
        const summarize: Summarizer = async (msgs, focus) => {
          const res = await fetch(`${origin}/api/summarize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: msgs, focus }),
          });
          if (!res.ok) return undefined;
          const data = (await res.json()) as { summary?: string };
          return data.summary;
        };
        const focus = typeof body.focus === "string" ? body.focus.slice(0, 400) : undefined;
        const result = await compactMessages(tokenMsgs, contextWindow, "summarize", { summarize, focus });
        if (result.compactedTokenCount < result.originalTokenCount) {
          modelMessages = result.messages.map((m) => ({
            role: m.role,
            content: [{ type: "text", text: m.content }],
          })) as typeof modelMessages;
          compactedSummary = result.summary;
        }
      }
    } catch {
      /* compaction is best-effort — keep the full history */
    }
  }

  // Φ-latency · T4 + T1 (see helpers above). Applied AFTER compaction so they
  // hold on every path: (T4) drop reasoning-only/empty assistant rows — a
  // force-settled max-effort think that never reached a text answer leaves one
  // in history and the recurring NIM 400 "Empty content is not allowed for
  // assistant messages" blocks every later turn — and (T1) bound input prefill
  // to a token budget, the model-speed-independent latency driver on long chats.
  modelMessages = modelMessages.filter(hasModelWorthyAssistantContent);
  modelMessages = trimModelMessagesToBudget(
    modelMessages,
    getContextBudget(modelConfig?.contextWindow ?? 128_000),
  );

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
      // Φ10/#3 — assistant reply id + its abort controller, created BEFORE the
      // streamText call so (a) the signal can be wired in (review M1: abort =
      // deliberate stop or settle timeout, never reload), and (b) the id the
      // route broadcasts matches what backgroundServe persists. unregister on
      // settle is handled inside backgroundServe's done().finally().
      // Φ-approval-resume: an Allow/Deny resend arrives as a new POST whose LAST
      // message is the assistant row carrying a `state:"approval-responded"` tool
      // part. Reuse that message's id so the server-side persistence UPSERTS the
      // same row (a fresh id would dup the bubble via the client's live-mirror)
      // and the SDK's streamText continues the paused tool call from history.
      const lastWire = messages[messages.length - 1];
      const isApprovalResume =
        lastWire?.role === "assistant" &&
        ((lastWire.parts ?? []) as Array<{ type?: string; state?: string }>).some(
          (p) => p?.state === "approval-responded",
        );
      const assistantId =
        isApprovalResume && typeof lastWire.id === "string" && lastWire.id
          ? lastWire.id
          : generateId();
      const genCtrl = createGenerationController(assistantId);
      // Declared OUTSIDE the try (its catch rethrows on streamText construction
      // errors) so the retry factory stays visible to backgroundServe below.
      let buildStream: (() => any) | null = null;
      // Φ-fallback (P1.2) · cross-model failover. AI SDK v7 has no native
      // cross-model dispatch (customProvider fallbackProvider is interface
      // inheritance, not error failover — see lib/ai/fallback.ts). The
      // backgroundServe retry loop builds a FRESH streamText per attempt, so
      // each call to buildStream advances to the next id in an ordered
      // allow-list (requested → best candidate). Escalation only on a
      // content-free HARD failure (isFallbackableErrorText); auth/rate-limit
      // errors stop instead of burning a reshot candidate. Declared OUTSIDE the
      // try so the retry factory + model recorder stay visible to the
      // backgroundServe call below; the image/video branches earlier already
      // excluded gen models from reaching here.
      const fallbackModels = buildFallbackModelChain(modelId, { max: 2 });
      let attemptIndex = 0;
      let actualModel = modelId;
      // MCP connects ONCE per request (before the retry factory) so a retry
      // never re-spawns child processes/sessions; released after the turn.
      const mcpHandle = await loadMcpTools();
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
        // LEOPARD MCP — operator-configured external tool servers (http/sse/
        // stdio). Fail-closed: LEOPARD_MCP_SERVERS unset → no MCP at all. A
        // broken server is logged + skipped; healthy ones contribute tools.
        // MCP tools keep the `mcp__server__tool` prefix (docs agent-sdk__mcp
        // naming) so approval rules (`^mcp__=deny`), the per-tool ask/deny gate,
        // and the audit trail all scope them cleanly.
        const mcpHasTools = mcpHandle.toolNames.length > 0;
        // Φ-docs · per-user memory loop. LEOPARD_MEMORY=1 → give the model
        // remember / listMemories / forgetById over the user's Convex-backed
        // long-term facts (injected into the system prompt on every turn).
        const memEnabled = process.env.LEOPARD_MEMORY === "1";
        const memUserId = userId ?? DEV_USER_ID;
        // Φ-docs · deep-research — LEOPARD_DEEP_RESEARCH=1 gives the model a
        // detached multi-source research worker (lib/ai/research/worker). It
        // shares the chat model + Tavily; spawn is fire-and-forget (jobId back,
        // report later in the research panel).
        const researchEnabled = process.env.LEOPARD_DEEP_RESEARCH === "1";
        // Φ6: createDocument — the downloadable-file tool. Gate consistent with
        // the other server tools: ENABLE_ARTIFACTS=1 (the flag the client uses
        // to decide whether artifact/file cards render). The tool needs the
        // dataStream writer (to stream the assembled doc) + the resolved model.
        const artifactsEnabled = process.env.ENABLE_ARTIFACTS === "1";
        const tools = {
          ...(webFetchEnabled ? { webFetch: webFetch({ dataStream }) } : {}),
          ...(webSearchEnabled ? { webSearch: webSearch() } : {}),
          ...(memEnabled ? memoryTools({ userId: memUserId }) : {}),
          ...(researchEnabled ? researchTools({ userId: memUserId, modelId }) : {}),
          ...(artifactsEnabled
            ? { createDocument: createDocument({ dataStream, modelId }) }
            : {}),
          ...mcpHandle.tools,
        };
        const supportsTools =
          webFetchEnabled ||
          webSearchEnabled ||
          memEnabled ||
          researchEnabled ||
          artifactsEnabled ||
          mcpHasTools;
        // Φ-docs · recall injection — the user's stored facts ride into the
        // system prompt each turn (listUserMemories returns [] when the admin
        // client or storage is unavailable; memory is additive, never fatal).
        // Φ-semantic: LEOPARD_SEMANTIC_MEMORY=1 reranks recall by similarity to
        // the current question (pinned first, others by cosine desc) so the
        // prompt-bound slice surfaces the most relevant facts — no vector DB
        // (embeddings stored on the row; brute-force cosine over the set).
        const memories = memEnabled
          ? process.env.LEOPARD_SEMANTIC_MEMORY === "1"
            ? await semanticRankMemories({ userId: memUserId, query: promptContext ?? "" })
            : await listUserMemories(memUserId)
          : undefined;

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
          // Φ-docs · low-risk tools auto-approve unless the operator's rules
          // EXPLICITLY deny them. Low-risk = read-only network + content tools
          // the user already invoked by asking, whose result lands only in their
          // own chat (webFetch/webSearch read the web; createDocument generates
          // an in-chat artifact), plus the user's own reversible recall store /
          // a read-only background search (memory_/research_).
          //
          // BUGFIX (tool-approval freeze): these used to return "user-approval"
          // under the default ask policy, but the detached backgroundServe drain
          // has no resume path for the client's tool-approval-response — the SDK
          // paused the stream, the card never resolved, and the model response
          // froze until the settle timeout. Auto-approving read-only/content
          // tools removes the freeze on the common path; genuinely risky MCP
          // tools still gate behind the AskCard.
          const lowRiskTool =
            (toolName ?? "").startsWith("memory_") ||
            (toolName ?? "").startsWith("research_") ||
            toolName === "webFetch" ||
            toolName === "webSearch" ||
            toolName === "createDocument";
          let decision: "approved" | "denied" | "user-approval" =
            d.mode === "allow" ? "approved" : d.mode === "deny" ? "denied" : "user-approval";
          // Auto-approve low-risk tools ONLY under the bare default (no operator
          // rules). An explicit TOOL_APPROVAL_RULES entry (e.g. webFetch=ask)
          // must win — else the AskCard can never surface and the gate is theatre.
          if (lowRiskTool && approvalRules.length === 0 && d.mode !== "deny") {
            decision = "approved";
          }
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

        buildStream = () => {
          const attemptModel = fallbackModels[Math.min(attemptIndex, fallbackModels.length - 1)];
          attemptIndex += 1;
          actualModel = attemptModel;
          const attemptCfg = getModelById(attemptModel);
          return streamText({
        model: getLanguageModel(attemptModel),
        // Φ10/#3 — aborts only on deliberate stop / settle-timeout, NOT on the
        // request signal (reload/close must let the detached generation finish).
        // Tool streams inherit this controller, so a reload mid-webFetch no longer
        // tears down the in-flight fetch (review M2); an explicit stop does.
        abortSignal: genCtrl.signal,
        // `supportsTools` gates the artifact-style prompt block in prompts.ts.
        // With only webFetch active (no createDocument client), we pass the
        // canonical web-fetch prompt semantics — prompt.ts owns the wording.
        // AI SDK v7: `system` → `instructions`.
        instructions: systemPrompt({
          requestHints: {},
          supportsTools,
          context: promptContext,
          memories,
          // Client-selected skill bodies (permanent library + local "+" skills).
          // Bounded server-side; rendered as ## Instructions blocks.
          skills: body.skills
            ?.filter((s) => typeof s === "string" && s.trim().length > 0)
            .slice(0, 20),
          // Φ-docs · output style (addon A): per-turn override wins, else the
          // LEOPARD_OUTPUT_STYLE env default; sanitized in output-styles.ts.
          styleDirective: resolveOutputStyleDirective({ style: body.styleRequested }),
        }),
        messages: modelMessages,
        // Cap output tokens — NIM rejects chat completions with no explicit
        // `max_tokens` (returns "Internal server error" / HTTP 500) since
        // 2026-07. 16384 fits within the smallest model context and matches
        // gateway defaults for comparable models. AI SDK v6 streams use
        // `maxOutputTokens` (NOT `maxTokens`).
        maxOutputTokens: 16384,
        // Φ-docs · per-turn cost/latency/tool observability (P2.4 feeder).
        // recordInputs/outputs:false still emits the usage/latency/tool-call
        // events (it only drops payloads) — cost estimate + latency + tool list
        // logged per LLM call; the usage ROW stays owned by backgroundServe's
        // committed-turn recordUsage (no double-count, no failed-attempt rows).
        telemetry: {
          functionId: "chat-turn",
          recordInputs: false,
          recordOutputs: false,
          integrations: [
            chatUsageTelemetry({ chatId: realChatId, userId: userId ?? DEV_USER_ID }),
          ],
        },
        providerOptions: {
          ...(attemptCfg?.gatewayOrder && {
            gateway: { order: attemptCfg.gatewayOrder },
          }),
          ...nimReasoningProviderOptions(attemptCfg, body.reasoning),
        },
        ...(supportsTools && {
          tools,
          stopWhen: stepCountIs(3),
        }),
        // Φ-docs: enterprise tool-execution audit. onToolExecutionEnd fires per
        // tool execution with toolCall (toolName/toolCallId/input) + toolOutput
        // (result, or `error` for a failed run). Append ONE ROW PER EXECUTED
        // TOOL with redacted+truncated input + output summary; failed runs are
        // flagged event:"tool-error". Approvals are audited separately in
        // toolApprovalDecision. Fire-and-forget — never fails the stream.
        onToolExecutionEnd: (event: any) => {
          try {
            const tc = event?.toolCall ?? {};
            const name = String(tc?.toolName ?? "");
            const input = tc?.input ?? tc?.args;
            const out = event?.toolOutput as Record<string, unknown> | undefined;
            const isErr = !!out && "error" in out;
            // Success envelope is {type:'tool-result', …, output}; failure is
            // {type:'tool-error', …, error}. Read the real field, not the
            // wrapper (the `fullOutput` shape doesn't exist in ai@7) — review F1.
            const value = isErr
              ? (out?.error ?? out)
              : out && "output" in out
                ? out.output
                : out;
            void recordAudit({
              assistantId,
              chatId: realChatId,
              userId: userId ?? DEV_USER_ID,
              event: isErr ? "tool-error" : "tool-execution",
              toolName: name,
              inputJson: scrubAuditField(input).slice(0, 2000),
              outputSummary: scrubAuditField(
                typeof value === "string" ? value : JSON.stringify(value ?? ""),
              ).slice(0, 4000),
            });
          } catch {
            /* audit is best-effort */
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
        };
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
        // Retry = a FRESH streamText per attempt (only fires when nothing
        // committed yet → no duplicate tool runs; docs/errors.md idempotency).
        streamFactory: buildStream! as () => Promise<any>,
        // P1.2: one attempt per model in the fallback chain; record the model
        // that ACTUALLY served; only escalate on a hard/transient error (not
        // 4xx/auth/rate-limit — those fail on any candidate).
        maxAttempts: fallbackModels.length,
        modelProvider: () => actualModel,
        retryPredicate: isFallbackableErrorText,
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
          console.log("[title] generated:", title, "for chat", realChatId);
          // Durable write: draft handoff navigates mid-stream, so the client
          // hint below can die with the abandoned response. The server owns
          // the real chat id — persist directly (sidebar "New Chat" bug).
          void persistChatTitle({
            chatId: realChatId,
            userId: userId ?? DEV_USER_ID,
            title,
          });
          // Cosmetic fast-path for a client that's still listening.
          dataStream.write({ type: "data-chat-title", data: title });
        } catch (e) {
          console.warn("[title] generation failed:", String(e).slice(0, 300));
        }
      } else {
        console.log("[title] skipped — not first exchange");
      }

      // Broadcast a compaction notice when the route folded older history.
      if (compactedSummary) {
        try {
          dataStream.write({ type: "data-compaction", data: compactedSummary, transient: true });
        } catch {
          /* cosmetic — the model already ran on compacted history */
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
      // Release MCP server connections (stdio child processes / http sessions).
      // Best-effort — a close failure must never surface as a route error.
      try {
        await mcpHandle.close();
      } catch {}
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
