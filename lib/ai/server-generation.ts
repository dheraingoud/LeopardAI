import { EventEmitter } from "node:events";
import { withUpstreamSlot, UpstreamBusyError } from "@/lib/ai/upstream-slot";
import { ConvexHttpClient } from "convex/browser";
import { api, internal } from "@/convex/_generated/api";
import { estimateCostUsd } from "@/lib/ai/telemetry";
import {
  EMBED_MODEL_DEFAULT,
  embedTexts,
  isSemanticMemoryEnabled,
  rankMemoriesByQuery,
} from "@/lib/ai/embeddings";
import { normalizeUIMessageParts } from "@/lib/ai/message-parts";

// ═══════════════════════════════════════════════════════════════════════════
// Φ10 / #3 — Server-owned background generation.
//
// Before: the browser owned the generation lifecycle. useChat sent a POST,
// /api/chat streamed SSE, and the CLIENT persisted the assistant reply to
// Convex only once `status === "ready"`. Reload / tab-close aborted the SSE →
// `streamText` cancelled → the reply was never persisted. "The user exits or
// the page reloads" = the generation silently dies.
//
// After: the ROUTE owns the assistant reply end-to-end. backgroundServe drives
// a streamText result inside a DETACHED async task that is not chained to the
// HTTP response lifecycle:
//   (1) inserts/stamps the assistant row in Convex (via a ConvexHttpClient +
//       adminAuth → api.messages.upsertAssistant, an owner-checked mutation)
//       immediately as a `streaming` placeholder,
//   (2) progressively patches that row as parts accumulate (throttled) so a
//       reloaded page shows partial progress,
//   (3) patches the canonical final parts + `status:"completed"` on finish,
//   (4) while broadcasting the live UI-protocol chunks over an in-process
//       EventEmitter that the route's SSE mirrors to the still-open browser.
//
// Because the persist loop and the model call are driven from the detached
// task — NOT from the SSE reader — a client disconnect only stops that browser's
// mirror, never the generation. On self-hosted `next start` the Node process
// keeps the task alive after the response closes, so reload/exit → generation
// completes → Convex holds the full reply → remount hydrates it.
//
// RELOAD vs STOP (review M1): both close the browser's fetch, so the wire alone
// can't distinguish them. The abort signal driving streamText is an explicit
// per-generation AbortController held in this module's registry — NOT the
// request signal. Reload/close leaves it un-aborted (generation continues);
// a deliberate stop calls abortGeneration(assistantId) (via /api/chat/stop),
// which aborts it, cancelling streamText and persisting only the partial reply.
// Because the tool streams inherit this same controller, a reload mid-webFetch
// no longer tears down the in-flight fetch either (review M2).
//
// Two hard safety nets: every Convex write is serialized on a single await-chain
// (review M4 — the final `completed` patch can never be reverted by a stale
// progressive patch), and a settle timeout aborts a stuck generation (e.g. a
// tool-approval request whose browser vanished) so it can never hang forever
// unreconciled (review M5).
//
// Security: ownership is enforced by the upsertAssistant MUTATION (data check
// via requireChatOwner). adminAuth bypasses Convex's auth, so the route — which
// already passed Clerk `auth()` — is the trust boundary: it asserts a userId it
// verified, and Convex refuses if that user doesn't own the chat. The mutation
// is internal (not on the public client surface) — see convex/messages.ts.
//
// Env: reads NEXT_PUBLIC_CONVEX_URL + CONVEX_DEPLOY_KEY. Writes are no-ops when
// the admin key is absent (local dev without the key still streams; just no
// persistence), matching the pre-#3 behavior.
// ═══════════════════════════════════════════════════════════════════════════

export type GenerationStatus = "streaming" | "completed";

// ── Per-generation abort registry (review M1) ───────────────────────────────
const _abortControllers = new Map<string, AbortController>();
// assistantId → chatId, so deleting a chat can abort its in-flight generation
// (operator 2026-09-04: deleted chats kept generating against a ghost row).
const _generationChat = new Map<string, string>();

/** Abort a live generation by its assistant message id. Returns false if none. */
export function abortGeneration(assistantId: string): boolean {
  const c = _abortControllers.get(assistantId);
  if (!c) return false;
  _abortControllers.delete(assistantId);
  _generationChat.delete(assistantId);
  try {
    c.abort();
  } catch {
    /* already aborted */
  }
  return true;
}

/** Abort EVERY live generation for a chat (chat delete path). Count aborted. */
export function abortChatGenerations(chatId: string): number {
  let n = 0;
  for (const [aid, cid] of [..._generationChat]) {
    if (cid === chatId && abortGeneration(aid)) n++;
  }
  return n;
}

/**
 * Create + register the controller for a generation, to run BEFORE the route
 * builds its streamText (so the signal can be passed in). Reload/exit must NOT
 * abort it; only stop (abortGeneration) or the settle timeout should.
 */
export function createGenerationController(assistantId: string, chatId?: string): AbortController {
  const c = new AbortController();
  _abortControllers.set(assistantId, c);
  if (chatId) _generationChat.set(assistantId, chatId);
  return c;
}

function unregisterGeneration(assistantId: string): void {
  _abortControllers.delete(assistantId);
  _generationChat.delete(assistantId);
}

// ── Convex admin client ─────────────────────────────────────────────────────
let _client: ConvexHttpClient | null = null;
let _clientInitFailed = false;

function convexClient(): ConvexHttpClient | null {
  if (_client || _clientInitFailed) return _client;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const key = process.env.CONVEX_DEPLOY_KEY;
  if (!url || !key) {
    _clientInitFailed = true;
    return null;
  }
  try {
    const c = new ConvexHttpClient(url);
    // A Convex deploy key ("prod:…") acts as an admin auth token:
    // setAdminAuth(token) stores it as this.adminAuth and every call goes out
    // with an `Authorization: Convex <key>` header that bypasses per-user auth.
    // The ROUTE (Clerk-authed) is the trust boundary — the upsertAssistant
    // mutation re-enforces chat ownership by data. setAdminAuth is @internal
    // (absent from the d.ts), hence the cast.
    (c as unknown as { setAdminAuth: (t: string, act?: unknown) => void }).setAdminAuth(
      key,
    );
    _client = c;
    return c;
  } catch {
    _clientInitFailed = true;
    return null;
  }
}

/** Persist the assistant row (create-or-patch by client id). Throws on failure. */
export async function persistAssistantRow(input: {
  chatId: string;
  userId: string;
  id: string;
  model?: string;
  parts: unknown[];
  status: GenerationStatus;
}): Promise<void> {
  const c = convexClient();
  if (!c) return; // no admin key configured → skip persistence (local dev fallback)
  const args = {
    chatId: input.chatId,
    userId: input.userId,
    id: input.id,
    model: input.model,
    parts: input.parts,
    status: input.status,
  } as never;
  // internalMutation (review m6) — keep the server-only write primitive off the
  // public client surface. Admin clients can invoke internal functions too.
  await c.mutation(internal.messages.upsertAssistant as never, args);
}

/**
 * Approval-resume anchor (2026-08-31): the client's resend POST carries the
 * approval-responded part on the CLIENT message id, which is NOT guaranteed to
 * be the persisted row's id (the server assigns assistant ids mid-stream).
 * Writing the resumed generation under the client id left the persisted row
 * stuck at `approval-requested` forever (a live Allow/Deny card on every
 * reload) and forked the turn into two rows. Resolve the ACTUAL persisted row
 * — the newest assistant row in this chat still holding an approval-requested
 * part — so the resumed generation upserts in place.
 */
export async function resolvePendingApprovalRowId(input: {
  chatId: string;
  userId: string;
}): Promise<{ id: string; parts: Array<Record<string, unknown>> } | null> {
  const c = convexClient();
  if (!c) return null;
  try {
    const rows = (await c.query(api.messages.list as never, {
      chatId: input.chatId,
    } as never)) as Array<{
      id: string;
      role: string;
      parts?: Array<Record<string, unknown>>;
    }>;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.role !== "assistant") continue;
      if (
        (r.parts ?? []).some(
          (p) => (p as { state?: string })?.state === "approval-requested",
        )
      ) {
        return { id: r.id, parts: r.parts ?? [] };
      }
    }
  } catch (e) {
    logWarn("resolvePendingApprovalRowId failed", e);
  }
  return null;
}

/**
 * Persist the generated chat title SERVER-side. Previously the title reached
 * Convex only via the client: the route emitted a `data-chat-title` chunk and
 * the hook called api.chats.updateTitle — but on the draft flow the client
 * navigates (/chat → /chat/<id>) mid-stream, so the chunk died with the
 * abandoned response (or arrived while convexChatId was still "draft" and the
 * owner check threw). Sidebar rows stayed "New Chat" forever. Now the route
 * calls this after titlePromise resolves; the client hint stays as a cosmetic
 * fast-path only.
 */
export async function persistChatTitle(input: {
  chatId: string;
  userId: string;
  title: string;
}): Promise<void> {
  const c = convexClient();
  if (!c) {
    console.warn("[title] no convex admin client (NEXT_PUBLIC_CONVEX_URL / CONVEX_DEPLOY_KEY missing?)");
    return;
  }
  try {
    await c.mutation(api.chats.setTitleIfUntitled as never, {
      chatId: input.chatId,
      userId: input.userId,
      title: input.title,
    } as never);
    console.log("[title] persisted:", input.title);
  } catch (e) {
    console.warn("[title] persist failed:", String(e).slice(0, 300));
  }
}

// ── Enterprise cost observability (Φ-docs / admin-setup) ────────────────────
type UsageInput = {
  chatId: string;
  userId: string;
  model: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs?: number;
  estimatedCostUsd?: number;
};

function toUsageInput(
  chatId: string,
  userId: string,
  model: string,
  usage: unknown,
  durationMs: number,
): UsageInput {
  const u = (usage ?? {}) as Record<string, number>;
  const input = u.promptTokens ?? u.inputTokens ?? u.input ?? 0;
  const output = u.completionTokens ?? u.outputTokens ?? u.output ?? 0;
  const total = u.totalTokens ?? input + output;
  const inTokens = typeof input === "number" ? input : 0;
  const outTokens = typeof output === "number" ? output : 0;
  return {
    chatId,
    userId,
    model,
    inputTokens: inTokens,
    outputTokens: outTokens,
    totalTokens: typeof total === "number" ? total : inTokens + outTokens,
    durationMs,
    estimatedCostUsd: estimateCostUsd(model, inTokens, outTokens) ?? undefined,
  };
}

/** Persist one usage row (real provider tokens) from the generation. */
export async function recordUsage(input: UsageInput): Promise<void> {
  const c = convexClient();
  if (!c) return; // no admin key → nothing to record
  try {
    await c.mutation(internal.usage.record as never, {
      chatId: input.chatId,
      userId: input.userId,
      model: input.model,
      provider: input.provider ?? undefined,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: input.totalTokens,
      durationMs: input.durationMs ?? undefined,
      estimatedCostUsd: input.estimatedCostUsd ?? undefined,
      ts: Date.now(),
    } as never);
  } catch (err) {
    logWarn("usage record failed", err);
  }
}

// ── Enterprise tool audit trail (Φ-docs) ─────────────────────────────────────
type AuditInput = {
  assistantId: string;
  chatId: string;
  userId: string;
  event: "approval" | "tool-execution" | "tool-error";
  toolName: string;
  decision?: string;
  reason?: string;
  inputJson?: string;
  outputSummary?: string;
};

// ── P2.4 per-chat usage readout ──────────────────────────────────────────────
export type ChatUsage = {
  count: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  estimatedCostUsd: number;
  rows: Array<{
    model: string;
    ts: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    durationMs?: number;
    estimatedCostUsd?: number;
  }>;
};

/** Per-chat usage aggregate for the readout (`chatId` = client chat UUID). Null
 * when the admin client / storage is unavailable. Never throws. */
export async function listChatUsage(input: {
  userId: string;
  chatId: string;
}): Promise<ChatUsage | null> {
  const c = convexClient();
  if (!c) return null;
  try {
    return (await c.query(internal.usage.listForChat as never, {
      userId: input.userId,
      chatId: input.chatId,
    } as never)) as unknown as ChatUsage;
  } catch (err) {
    logWarn("usage readout failed", err);
    return null;
  }
}

/** Append one tool-audit row (approval gate or execution). Best-effort: logs a
 * warning on failure, never throws into the generation. */
export async function recordAudit(input: AuditInput): Promise<void> {
  const c = convexClient();
  if (!c) return; // no admin key → observability gap, not a failure
  try {
    await c.mutation(internal.audit.record as never, {
      assistantId: input.assistantId,
      chatId: input.chatId,
      userId: input.userId,
      event: input.event,
      toolName: input.toolName,
      decision: input.decision ?? undefined,
      reason: input.reason ?? undefined,
      inputJson: input.inputJson ?? undefined,
      outputSummary: input.outputSummary ?? undefined,
      ts: Date.now(),
    } as never);
  } catch (err) {
    logWarn("audit record failed", err);
  }
}

// ── Per-user long-term memory (Φ-docs recall loop) ──────────────────────────
export type UserMemory = {
  id: string;
  text: string;
  pinned?: boolean;
  updatedAt: number;
  /** Φ-semantic: the fact's NIM embedding (present when LEOPARD_SEMANTIC_MEMORY
   * stored it). Used only for similarity ranking; never injected into prompts. */
  embedding?: number[];
  embedModel?: string;
};

/** Ordered recall list for the route to inject into the system prompt AND for
 * the model's listMemories tool. Returns [] when unconfigured (no admin
 * client) — memory is additive, never fatal to a turn. */
export async function listUserMemories(userId: string): Promise<UserMemory[]> {
  const c = convexClient();
  if (!c) return [];
  try {
    const rows = (await c.query(internal.userMemory.listForUser as never, {
      userId,
    } as never)) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => {
      const emb = (r as { embedding?: unknown }).embedding;
      return {
        id: String((r as { _id?: unknown })._id ?? ""),
        text: String((r as { text?: unknown }).text ?? ""),
        pinned: Boolean((r as { pinned?: unknown }).pinned),
        updatedAt: Number((r as { updatedAt?: unknown }).updatedAt ?? 0),
        ...(Array.isArray(emb) && emb.length
          ? { embedding: emb as number[], embedModel: String((r as { embedModel?: unknown }).embedModel ?? "") }
          : {}),
      };
    });
  } catch (err) {
    logWarn("memory recall failed", err);
    return [];
  }
}

/** Remember a fact (deduplicated by normalized text). Returns total count, or
 * 0 when unconfigured (no admin client) so a stray write can't fail a turn. */
export async function rememberUserMemory(input: {
  userId: string;
  text: string;
  pinned?: boolean;
}): Promise<number> {
  const c = convexClient();
  if (!c) return 0;
  // Φ-semantic: when enabled (+ key present), embed the fact so future turns can
  // rank it by meaning. Fail-open: an embed failure still saves the plain fact
  // (recall degrades to pinned+newest) — memory must never be lost to a vector
  // hiccup.
  let semantic: { embedding: number[]; embedModel: string } | undefined;
  if (isSemanticMemoryEnabled()) {
    try {
      const vecs = await embedTexts([input.text]);
      if (vecs[0]?.length) {
        semantic = {
          embedding: vecs[0],
          embedModel: process.env.NIM_EMBED_MODEL || EMBED_MODEL_DEFAULT,
        };
      }
    } catch {}
  }
  try {
    const total = (await c.mutation(internal.userMemory.remember as never, {
      userId: input.userId,
      text: input.text,
      pinned: input.pinned,
      ...(semantic ? semantic : {}),
    } as never)) as unknown;
    return typeof total === "number" ? total : 0;
  } catch (err) {
    logWarn("memory remember failed", err);
    return 0;
  }
}

/**
 * Φ-semantic recall: order a user's memories by similarity to the current query
 * (pinned always first, newest within pinned; the rest by cosine desc) so the
 * prompt-bound slice (MAX_MEMORIES) surfaces the most relevant facts. Falls back
 * to the existing ordered recall when semantic recall is off, the query is
 * empty, or an embed/rank step fails — never throws into the turn.
 */
export async function semanticRankMemories(input: {
  userId: string;
  query: string;
}): Promise<UserMemory[]> {
  const base = await listUserMemories(input.userId);
  if (!isSemanticMemoryEnabled() || !input.query) return base;
  try {
    const vec = await embedTexts([input.query]);
    if (!vec[0]?.length) return base;
    return rankMemoriesByQuery(vec[0], base);
  } catch (err) {
    logWarn("semantic recall failed", err);
    return base;
  }
}

/** Forget a specific memory. True on success. */
export async function forgetUserMemory(input: {
  userId: string;
  memoryId: string;
}): Promise<boolean> {
  const c = convexClient();
  if (!c) return false;
  try {
    const ok = (await c.mutation(internal.userMemory.forgetById as never, {
      userId: input.userId,
      memoryId: input.memoryId,
    } as never)) as unknown;
    return ok === true;
  } catch (err) {
    logWarn("memory forget failed", err);
    return false;
  }
}

/**
 * True when a user has consumed ≥ LEOPARD_DAILY_TOKEN_CAP tokens in the last
 * 24h. Cap off unless LEOPARD_DAILY_TOKEN_CAP is set to a positive integer.
 * The route calls this before streaming and returns 429 when over.
 */
export async function isOverDailyTokenCap(userId: string): Promise<boolean> {
  const cap = Number(process.env.LEOPARD_DAILY_TOKEN_CAP ?? 0);
  if (!(cap > 0)) return false;
  const c = convexClient();
  if (!c) return false;
  try {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const total = (await c.query(
      internal.usage.sumTokensSince as never,
      { userId, since } as never,
    )) as unknown;
    return typeof total === "number" && total >= cap;
  } catch (err) {
    logWarn("daily cap check failed", err);
    return false; // fail-open on check failure (observability gap, not auth)
  }
}

/** Minimal structured logger — persists failures must be observable (review m10). */
function logWarn(msg: string, err?: unknown): void {
  const detail = err instanceof Error ? `: ${err.message}` : err ? `: ${String(err)}` : "";
  console.error(`[server-generation] ${msg}${detail}`);
  try {
    const fs = require("node:fs");
    const p = process.env.LEOPARD_DEBUG_LOG;
    if (p) fs.appendFileSync(p, new Date().toISOString() + ` [server-generation] ${msg}${detail}\n`);
  } catch {}
}

/** Accumulate UI-protocol raw chunks into readable parts for progressive patches. */
class PartAccumulator {
  private text = "";
  private reasoning = "";
  private tools: Array<Record<string, unknown>> = [];
  /** Reasoning wall-clock window — persisted as durationMs so the "Thought for
   * N seconds" label survives reload (client-side cache dies with the page). */
  private reasoningStartMs: number | null = null;
  private reasoningEndMs: number | null = null;

  /** Approval-resume seed: the resumed run re-persists the row from scratch
   * (placeholder write), so the previously persisted tool parts must be
   * carried over or they vanish on reload. The resumed stream re-emits the
   * same toolCallIds and merges into these entries. */
  constructor(seedTools?: Array<Record<string, unknown>>) {
    this.tools = (seedTools ?? []).map((t) => ({ ...t }));
  }

  push(chunk: { type?: string; [k: string]: unknown }): void {
    switch (chunk.type) {
      case "text-delta":
        if (this.reasoningStartMs !== null && this.reasoningEndMs === null)
          this.reasoningEndMs = Date.now();
        this.text += String(chunk.delta ?? "");
        break;
      case "reasoning-delta":
        if (this.reasoningStartMs === null) this.reasoningStartMs = Date.now();
        this.reasoning += String(chunk.delta ?? "");
        break;
      case "tool-call-end": // legacy alias
      case "tool-input-start":
      case "tool-input-available": {
        // One entry per call: the stream can emit input-start AND
        // input-available for the same toolCallId — merge, never push twice
        // (observed: two "Creating document…" cards for one createDocument).
        const existing = this.tools.find((x) => x.toolCallId === chunk.toolCallId);
        if (existing) {
          existing.input =
            (chunk as { args?: unknown }).args ??
            (chunk as { input?: unknown }).input ??
            existing.input;
          break;
        }
        this.tools.push({
          // tool-<name>, not the generic "tool": DocumentCard/ArtifactPanel
          // match `tool-createDocument` exactly, and convertToModelMessages
          // only recognizes the prefixed form on the wire. The generic form
          // silently dropped artifact panels on reload.
          type: `tool-${String(chunk.toolName ?? "")}`,
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          state: "pending",
          input: (chunk as { args?: unknown }).args ?? (chunk as { input?: unknown }).input,
        });
        break;
      }
      case "tool-approval-request": {
        const t = this.tools.find((x) => x.toolCallId === chunk.toolCallId);
        if (t) {
          t.state = "approval-requested";
          // Persist the approval id: the client's pendingApproval gate reads
          // p.approval.id. Without it the live-mirror swap (SDK bubble →
          // Convex row) dropped the field and the Allow/Deny dock unmounted
          // mid-decision (card vanished, turn looked dead — 2026-09-04).
          const approvalId = (chunk as { approvalId?: string }).approvalId;
          if (approvalId) t.approval = { id: approvalId };
        }
        break;
      }
      case "tool-approval-response": {
        const t = this.tools.find((x) => x.toolCallId === chunk.toolCallId);
        if (t) t.state = "approval-responded";
        break;
      }
      case "tool-output-available": {
        const t = this.tools.find((x) => x.toolCallId === chunk.toolCallId);
        if (t) {
          t.state = "output-available";
          t.output = (chunk as { output?: unknown }).output;
        }
        break;
      }
      case "tool-output-error": {
        const t = this.tools.find((x) => x.toolCallId === chunk.toolCallId);
        if (t) {
          t.state = "output-error";
          t.output = { error: String((chunk as { errorText?: unknown }).errorText ?? "tool error") };
        }
        break;
      }
      default:
        break;
    }
  }

  parts(): Array<
    | { type: "text"; text: string }
    | { type: "reasoning"; text: string }
    | Record<string, unknown>
  > {
    const out: Array<
      | { type: "text"; text: string }
      | { type: "reasoning"; text: string }
      | Record<string, unknown>
    > = [];
    if (this.reasoning.trim()) {
      // parts() runs progressively mid-stream — never mutate the window here;
      // an open window (reasoning-only so far) just measures up to now.
      const end = this.reasoningEndMs ?? Date.now();
      const durationMs =
        this.reasoningStartMs !== null ? end - this.reasoningStartMs : undefined;
      out.push({
        type: "reasoning",
        text: this.reasoning,
        ...(durationMs !== undefined ? { durationMs } : {}),
      });
    }
    if (this.text.trim()) out.push({ type: "text", text: this.text });
    out.push(...this.tools);
    return out;
  }
}

/** The UI protocol chunks a `toUIMessageStream()` yields. */
export type UIMessageStreamChunk = { type?: string; [k: string]: unknown };

/** A live generation handle. */
export type ServerGenerationHandle = {
  assistantId: string;
  subscribe(cb: (chunk: UIMessageStreamChunk) => void): () => void;
  readonly done: Promise<void>;
  /** True once the generation was aborted (explicit stop or settle timeout). */
  isAborted: () => boolean;
};

const errMsg = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
};

const REPLAY_CAP = 5000;

/** Sleep that ends EARLY when the generation aborts — a stop clicked during
 *  the retry backoff used to wait out the full delay before the loop noticed
 *  (operator 2026-09-04: "stop doesn't work during automatic retry"). */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((res) => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      res();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}
const PERSIST_INTERVAL_MS = 800;
const PERSIST_BATCH = 120;

/** A chunk that proves the model actually produced output (vs. an empty/stalled
 * attempt). Drives the retry gate — we NEVER auto-retry once real content or a
 * tool call has committed (docs/errors.md idempotency: re-running a turn that
 * already executed tools would fire the side effects twice). */
function isGenerationContent(chunk: UIMessageStreamChunk): boolean {
  return (
    chunk?.type === "text-delta" ||
    chunk?.type === "reasoning-delta" ||
    chunk?.type === "tool-call-end" ||
    chunk?.type === "tool-call-start"
  );
}

export function backgroundServe(args: {
  result?: any;
  /** Re-invoked for each retry attempt — MUST return a FRESH streamText result
   * (a consumed result cannot be re-derived). Required for retries to engage. */
  streamFactory?: () => Promise<any>;
  /** Total attempts incl. the first. Only meaningful with streamFactory. */
  maxAttempts?: number;
  /** Fixed delay before each retry (docs: "Retrying in Ns · attempt x/y"). */
  retryBackoffMs?: number;
  sendReasoning: boolean;
  assistantId: string;
  chatId: string;
  userId: string;
  model?: string;
  persist?: boolean;
  /** Resolves the model id ACTUALLY serving the current attempt — lets a
   * cross-model fallback (see lib/ai/fallback.ts) record the real model in the
   * usage row instead of the requested id. Defaults to the static `model`. */
  modelProvider?: () => string;
  /** Returns false to STOP retrying a terminal, content-free failure (no next
   * attempt/model). Lets a caller skip fallback on auth/rate-limit/config errors
   * that would recur identically on every candidate. Defaults to retry-always. */
  retryPredicate?: (errorMessage: string) => boolean;
  /** Tool parts carried over from the persisted row on an approval-resume —
   * the placeholder write would otherwise wipe them (card gone on reload). */
  seedToolParts?: Array<Record<string, unknown>>;
  /** Runs once at generation start — after the seed parts are emitted, before
   * the first stream attempt. Approval-resume uses it to execute the approved
   * tools live: chunks it emits (data-orchestration progress,
   * tool-output-available) go to the bus AND the accumulator, so the card
   * updates in real time and the outputs persist. */
  prelude?: (emit: (chunk: UIMessageStreamChunk) => void) => Promise<void>;
  /** The controller driving this generation (see createGenerationController). */
  abortController: AbortController;
  /** Hard ceiling before a stuck generation is force-persisted + aborted. */
  settleTimeoutMs?: number;
}): ServerGenerationHandle {
  const {
    result,
    streamFactory,
    sendReasoning,
    assistantId,
    chatId,
    userId,
    model,
    persist = true,
    modelProvider,
    retryPredicate,
    abortController: ctrl,
    settleTimeoutMs = 300_000,
  } = args;
  const maxAttempts = Math.max(1, args.maxAttempts ?? (streamFactory ? 3 : 1));
  const retryBackoffMs = args.retryBackoffMs ?? 2_500;
  /** First attempt = explicit `result` when given, else the factory. */
  const makeResult =
    streamFactory ??
    (result ? (async () => result) : undefined);

  const bus = new EventEmitter();
  const replay: UIMessageStreamChunk[] = [];
  const acc = new PartAccumulator(args.seedToolParts);

  let settled = false;
  let generationAborted = false;
  const genStart = Date.now();

  // ── M11: immediate streaming placeholder (reload before first chunk → bubble) ─
  // ── M4: ALL Convex writes serialized on one chain so the final `completed`
  //    patch can never be superseded by a stale progressive `streaming` patch. ─
  let writeChain: Promise<void> = Promise.resolve();
  const enqueueWrite = (w: () => Promise<void>): Promise<void> => {
    writeChain = writeChain.then(w).catch((e) => logWarn("persist failed", e));
    return writeChain;
  };
  if (persist) {
    enqueueWrite(() =>
      persistAssistantRow({
        chatId,
        userId,
        id: assistantId,
        model,
        // acc.parts() (not []) so approval-resume seeds survive the placeholder.
        parts: acc.parts(),
        status: "streaming",
      }),
    );
  }

  // M5: hard settle safety net — a generation that can never settle (e.g. a
  // tool-approval request whose browser is gone, or a hung upstream) is aborted
  // after the ceiling so it can't hold the process open forever; partial is then
  // persisted as completed by the loop's abort branch. The timer is IDLE-based,
  // not absolute: any emitted chunk (text token, tool event, data-orchestration
  // snapshot) resets it. Multi-agent runs legitimately stream progress for many
  // minutes (3 agents × up to 120s each) — an absolute ceiling force-aborted
  // them mid-orchestration (observed 2026-09-02: "Stopped" card + frozen
  // composer at exactly 300s). Declared before `emit` — emit touches it, and
  // the first emit (data-assistant-id) happens immediately below.
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const armSettleTimer = () => {
    settleTimer = setTimeout(() => {
      if (!settled && !ctrl.signal.aborted) {
        logWarn(
          `generation ${assistantId} idle for ${settleTimeoutMs}ms — force-settling`,
        );
        try {
          ctrl.abort();
        } catch {}
      }
    }, settleTimeoutMs);
  };
  const touchSettleTimer = () => {
    if (settled) return;
    clearTimeout(settleTimer);
    armSettleTimer();
  };
  armSettleTimer();

  const emit = (chunk: UIMessageStreamChunk) => {
    touchSettleTimer();
    // tool-approval-request is a LIVE-ONLY gate signal: the decision is folded
    // into the tool part's state, so replaying the request to a reloaded
    // client (whose DB-seeded parts hold the call as approval-responded)
    // throws ToolCallNotFoundForApprovalError in the SDK transform. Keep it
    // out of the replay log; live subscribers still receive it below.
    if (chunk.type !== "tool-approval-request" && replay.length < REPLAY_CAP)
      replay.push(chunk);
    bus.emit("chunk", chunk);
  };

  // M8: the server id is a control signal — mark transient so the client never
  // folds it into message.parts (and it never round-trips into model history).
  emit({ type: "data-assistant-id", data: assistantId, transient: true });

  // Approval-resume: seeded tool parts live only in the accumulator (DB +
  // replay) — the LIVE client never sees them unless they go out as protocol
  // chunks, so the resumed Subagents/tool card didn't render until reload.
  // Emit them as tool-input-available (+ tool-output-available when the
  // resume already executed the tool) so the card appears live.
  for (const seeded of args.seedToolParts ?? []) {
    const toolCallId = (seeded as { toolCallId?: string }).toolCallId;
    if (!toolCallId) continue;
    const toolName =
      (seeded as { toolName?: string }).toolName ??
      String((seeded as { type?: string }).type ?? "").replace(/^tool-/, "");
    emit({
      type: "tool-input-available",
      toolCallId,
      toolName,
      input: (seeded as { input?: unknown }).input,
    } as UIMessageStreamChunk);
    const out = (seeded as { output?: unknown }).output;
    const st = (seeded as { state?: string }).state;
    if (st === "output-available" && out !== undefined) {
      emit({
        type: "tool-output-available",
        toolCallId,
        output: out,
      } as UIMessageStreamChunk);
    }
  }

  // Throttled progressive patch.
  let unpersisted = 0;
  let lastProgressive = 0;
  const maybePersistProgressive = async () => {
    if (!persist) return;
    unpersisted += 1;
    const now = Date.now();
    if (unpersisted < PERSIST_BATCH && now - lastProgressive < PERSIST_INTERVAL_MS) return;
    unpersisted = 0;
    lastProgressive = now;
    await enqueueWrite(() =>
      persistAssistantRow({
        chatId,
        userId,
        id: assistantId,
        model,
        parts: acc.parts(),
        status: "streaming",
      }),
    );
  };

  // Persist whatever accumulated, as a settled (completed) row. Used on error/
  // abort so the user keeps partial context rather than losing the message.
  const finalizePartial = async () => {
    if (!persist) return;
    await enqueueWrite(() =>
      persistAssistantRow({
        chatId,
        userId,
        id: assistantId,
        model,
        parts: acc.parts(),
        status: "completed",
      }),
    );
  };

  // M5: hard settle safety net — a generation that can never settle (e.g. a
  // tool-approval request whose browser is gone, or a hung upstream) is aborted
  // after the ceiling so it can't hold the process open forever; partial is then
  // persisted as completed by the loop's abort branch. Declared before `done`
  // (its finally calls clearTimeout) to avoid a TDZ reference.
  // (M5 settle safety net lives above `emit` — idle-based, reset per chunk.)

  // True once ANY text / reasoning / tool output landed. Guards the retry gate:
  // a turn that already produced content (or executed tools) is NEVER re-run —
  // that would duplicate side effects (docs/errors.md idempotency + partial-
  // output preservation).
  let committed = false;
  let lastResult: any = null;

  /** Consume ONE streamText result to its end, forwarding every chunk. Returns
   * `error` if the stream's terminal state was a failure. Safe to re-invoke on a
   * FRESH result from the factory. */
  const driveAttempt = async (r: any): Promise<{ error?: string }> => {
    let attemptError: string | undefined;
    try {
      const merged = (await r.toUIMessageStream({
        sendReasoning,
        onError: (err: unknown) => {
          attemptError = errMsg(err);
          // QA M1: once content has committed, the partial is persisted as the
          // final row — a protocol error chunk would flip the client to
          // status:"error" and trigger the destructive auto-regenerate, which
          // deletes the good row and replaces it with a second generation.
          // Log it; don't emit it.
          if (!committed) emit({ type: "error", errorText: errMsg(err) });
          else logWarn("post-commit upstream error suppressed", err);
          // MUST return a string: undefined here serializes as a bare
          // {"type":"error"} chunk, which the client's uiMessageChunkSchema
          // rejects with AI_TypeValidationError and the whole stream dies
          // (2026-09-04 approval-resume crash).
          return attemptError ?? "Unknown error";
        },
      })) as AsyncIterable<UIMessageStreamChunk>;
      // Φ-stall watchdog: an upstream that opens fine but then hangs (observed:
      // kimi-k3 occasionally stalls with zero chunks for 60s+, the "response
      // never arrives" bug) used to sit until the 60s settle ceiling. Now any
      // chunk-gap over LEOPARD_STALL_MS (default 18s) ends the attempt as a
      // stall error → the retry loop escalates to the next fallback model when
      // nothing committed yet, or keeps the partial when it has.
      // Two-phase stall budget: a healthy model starts chunking within ~10s,
      // so a silent OPEN is almost certainly a hung upstream — kill at 45s.
      // Once chunks flow, gaps between them (long reasoning, tool waits) get
      // the wider window: 180s with reasoning on (thinking models emit
      // reasoning in bursts with >90s silences — 2026-08-31 diffusiongemma
      // turn was killed mid-stream at 90s with content already flowing).
      const STALL_OPEN_MS = Math.max(4_000, Number(process.env.LEOPARD_STALL_OPEN_MS ?? 45_000) || 45_000);
      const STALL_MS = Math.max(
        4_000,
        Number(process.env.LEOPARD_STALL_MS ?? (sendReasoning ? 180_000 : 45_000)) ||
          (sendReasoning ? 180_000 : 45_000),
      );
      let sawChunk = false;
      // Token-burn guard (2026-09-04): a reasoning model that thinks FOREVER
      // (observed: laguna reasoning 1500s+ on a simple prompt) burns tokens the
      // whole time. Cap the reasoning-only phase; past the budget with no
      // answer text the attempt ends as a retryable error and the fallback
      // chain takes over. Env: LEOPARD_REASONING_BUDGET_MS (default 240s).
      let firstReasoningAt: number | null = null;
      let sawAnswerText = false;
      const REASONING_BUDGET_MS = Math.max(
        30_000,
        Number(process.env.LEOPARD_REASONING_BUDGET_MS ?? 240_000) || 240_000,
      );
      const it = merged[Symbol.asyncIterator]();
      try {
        for (;;) {
          let stall: ReturnType<typeof setTimeout> | undefined;
          const budget = sawChunk ? STALL_MS : STALL_OPEN_MS;
          const next = await Promise.race([
            it.next(),
            new Promise<never>((_, rej) => {
              stall = setTimeout(
                () => rej(new Error(`stall: no chunk for ${budget}ms`)),
                budget,
              );
            }),
          ]).finally(() => {
            if (stall) clearTimeout(stall);
          });
          if (next.done) break;
          sawChunk = true;
          const chunk = next.value;
          acc.push(chunk);
          emit(chunk);
          committed = committed || isGenerationContent(chunk);
          const ctype = (chunk as { type?: string }).type;
          // Arm on ANY reasoning chunk — some providers (deepseek-v4-flash on
          // NIM, observed 2026-09-05) stream reasoning-delta without a preceding
          // reasoning-start, which left firstReasoningAt null and disabled the
          // budget entirely (a 354s reasoning run slipped through).
          if (
            (ctype === "reasoning-start" || ctype === "reasoning-delta") &&
            firstReasoningAt === null
          )
            firstReasoningAt = Date.now();
          if (ctype === "text-start" || ctype === "text-delta") sawAnswerText = true;
          if (
            firstReasoningAt !== null &&
            !sawAnswerText &&
            Date.now() - firstReasoningAt > REASONING_BUDGET_MS
          ) {
            throw new Error(
              `reasoning budget exceeded: ${Math.round((Date.now() - firstReasoningAt) / 1000)}s of thinking with no answer (cap ${Math.round(REASONING_BUDGET_MS / 1000)}s)`,
            );
          }
          void maybePersistProgressive(); // throttled; serialized by the write chain
        }
      } finally {
        // Release the hung upstream iterator (its fetch is torn down when the
        // attempt's result is GC'd / the generation controller eventually
        // aborts; we never block the retry loop on it).
        void it.return?.().catch(() => {});
      }
    } catch (err) {
      attemptError = attemptError ?? errMsg(err);
    }
    return { error: attemptError };
  };

  const done = (async () => {
    try {
      // Approval-resume tool execution (and any other pre-stream work) — runs
      // after the seed chunks went out, before the first streamText attempt.
      // Emitted chunks persist via the accumulator AND stream to the client.
      if (args.prelude) {
        try {
          await args.prelude((c) => {
            acc.push(c);
            emit(c);
          });
        } catch (preludeErr) {
          // A failed prelude must not kill the turn: log + continue into the
          // synthesis stream (the model sees the tool error in its history).
          logWarn("prelude failed", preludeErr);
        }
      }
      if (!makeResult) {
        emit({ type: "error", errorText: "missing generation source" });
        await finalizePartial();
        return;
      }

      let outcome: { error?: string } | undefined;
      let attempt = 1;
      while (attempt <= maxAttempts) {
        if (ctrl.signal.aborted) {
          generationAborted = true;
          await finalizePartial();
          return;
        }
        // One upstream slot covers makeResult + the FULL drain: the NIM
        // request stays open for the entire stream, so the slot must too
        // (NIM workers cap at 32 concurrent — ResourceExhausted otherwise).
        let slotError: unknown = null;
        try {
          await withUpstreamSlot(async () => {
            const r = await makeResult();
            lastResult = r;
            outcome = await driveAttempt(r);
          });
        } catch (err) {
          slotError = err;
        }
        if (slotError) {
          if (slotError instanceof UpstreamBusyError) {
            // Queue was full for 20s — clean error card, not a hung stream.
            outcome = { error: "Server is at capacity — retry in a moment." };
            break;
          }
          // A construction-time throw (e.g. upstream 400 surfaced eagerly) is a
          // content-free failure too — run it through the SAME retry/fallback
          // path as an in-stream error instead of dying on attempt 1.
          outcome = { error: errMsg(slotError) };
          if (ctrl.signal.aborted) {
            generationAborted = true;
            await finalizePartial();
            return;
          }
          if (attempt >= maxAttempts) break;
          if (retryPredicate && !retryPredicate(outcome.error ?? "")) break;
          emit({
            type: "data-retry",
            data: { attempt, maxRetries: maxAttempts - attempt, delayMs: retryBackoffMs },
            transient: true,
          });
          await abortableSleep(retryBackoffMs * attempt, ctrl.signal);
          attempt += 1;
          continue;
        }

        if (ctrl.signal.aborted) {
          generationAborted = true;
          await finalizePartial();
          return;
        }
        // Retry ONLY a terminal, content-free attempt (empty completion or an
        // error before a single token/tool landed). committed → break (keep
        // the partial, end turn) — never re-run a side-effecting turn. A caller
        // retryPredicate can also veto escalation (e.g. don't swap to another
        // model on an auth/rate-limit error that would recur identically).
        // A reasoning-budget abort IS content-free for retry purposes even
        // though reasoning-deltas set `committed` — the user got zero answer;
        // escalate to the next attempt/model instead of parking on a
        // reasoning-only turn (2026-09-04 token-burn guard).
        const budgetHit = outcome?.error?.startsWith("reasoning budget exceeded") === true;
        if ((committed && !budgetHit) || attempt >= maxAttempts) break;
        if (retryPredicate && !retryPredicate(outcome?.error ?? "")) break;

        // Client-visible "Retrying in Ns · attempt x/y" (docs retry-progress UX).
        // MUST be a data-* part: the client's uiMessageChunkSchema rejects any
        // unknown non-data type with a hard AI_TypeValidationError (observed:
        // our `{type:"error", error}` shape crashed streams the same way).
        emit({
          type: "data-retry",
          data: { attempt, maxRetries: maxAttempts - attempt, delayMs: retryBackoffMs },
          transient: true,
        });
        await abortableSleep(retryBackoffMs * attempt, ctrl.signal);
        attempt += 1;
      }

      if (ctrl.signal.aborted) {
        generationAborted = true;
        await finalizePartial();
        return;
      }

      if (committed) {
        // Stream produced output (or was finalized) → canonical completed status.
        const accParts = acc.parts();
        const finalParts = normalizeUIMessageParts(
          Array.isArray(await lastResult.parts) ? await lastResult.parts : accParts,
        ) as unknown[];
        // SDK response parts drop our durationMs stamp — re-attach so the
        // "Thought for N" label survives reload (operator 2026-09-04).
        const accReasoning = accParts.find(
          (p) => p.type === "reasoning" && (p as { durationMs?: number }).durationMs,
        ) as { durationMs?: number } | undefined;
        if (accReasoning?.durationMs !== undefined) {
          const target = (finalParts as Array<{ type?: string; durationMs?: number }>)
            .find((p) => p.type === "reasoning");
          if (target && target.durationMs === undefined) {
            target.durationMs = accReasoning.durationMs;
          }
        }
        await enqueueWrite(() =>
          persistAssistantRow({
            chatId,
            userId,
            id: assistantId,
            model,
            parts: finalParts,
            status: "completed",
          }),
        );
        // Enterprise cost observability (Φ-docs). Failures logged, never fatal.
        let usage: unknown;
        try {
          usage = await lastResult.usage;
        } catch {
          usage = undefined;
        }
        const usedModel = modelProvider ? modelProvider() : (model as string) ?? "";
        void recordUsage(
          toUsageInput(chatId, userId, usedModel, usage, Date.now() - genStart),
        ).catch(() => {});
      } else {
        // Exhausted every attempt with no output → keep the (empty) partial as
        // completed + surface the failure. Stuck generation → settle timer aborts.
        emit({ type: "error", errorText: outcome?.error ?? "Generation produced no output." });
        await finalizePartial();
      }
    } catch (err) {
      generationAborted = ctrl.signal.aborted;
      emit({ type: "error", errorText: errMsg(err) });
      await finalizePartial();
    } finally {
      clearTimeout(settleTimer);
      settled = true;
      unregisterGeneration(assistantId);
      bus.emit("end");
    }
  })();

  void done;
  void persistAssistantRow; // referenced (keeps tree-shakers honest)

  return {
    assistantId,
    subscribe: (cb) => {
      for (const c of replay) {
        try {
          cb(c);
        } catch {}
      }
      const on = (c: UIMessageStreamChunk) => {
        try {
          cb(c);
        } catch {}
      };
      bus.on("chunk", on);
      return () => bus.off("chunk", on);
    },
    done,
    isAborted: () => generationAborted,
  };
}