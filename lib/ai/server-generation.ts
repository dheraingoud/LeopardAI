import { EventEmitter } from "node:events";
import { ConvexHttpClient } from "convex/browser";
import { internal } from "@/convex/_generated/api";
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

/** Abort a live generation by its assistant message id. Returns false if none. */
export function abortGeneration(assistantId: string): boolean {
  const c = _abortControllers.get(assistantId);
  if (!c) return false;
  _abortControllers.delete(assistantId);
  try {
    c.abort();
  } catch {
    /* already aborted */
  }
  return true;
}

/**
 * Create + register the controller for a generation, to run BEFORE the route
 * builds its streamText (so the signal can be passed in). Reload/exit must NOT
 * abort it; only stop (abortGeneration) or the settle timeout should.
 */
export function createGenerationController(assistantId: string): AbortController {
  const c = new AbortController();
  _abortControllers.set(assistantId, c);
  return c;
}

function unregisterGeneration(assistantId: string): void {
  _abortControllers.delete(assistantId);
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
  return {
    chatId,
    userId,
    model,
    inputTokens: typeof input === "number" ? input : 0,
    outputTokens: typeof output === "number" ? output : 0,
    totalTokens: typeof total === "number" ? total : input + output,
    durationMs,
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

  push(chunk: { type?: string; [k: string]: unknown }): void {
    switch (chunk.type) {
      case "text-delta":
        this.text += String(chunk.delta ?? "");
        break;
      case "reasoning-delta":
        this.reasoning += String(chunk.delta ?? "");
        break;
      case "tool-call-end":
        this.tools.push({
          type: "tool",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          input: (chunk as { args?: unknown }).args ?? (chunk as { input?: unknown }).input,
        });
        break;
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
    if (this.reasoning.trim()) out.push({ type: "reasoning", text: this.reasoning });
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
  const acc = new PartAccumulator();

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
        parts: [],
        status: "streaming",
      }),
    );
  }

  const emit = (chunk: UIMessageStreamChunk) => {
    if (replay.length < REPLAY_CAP) replay.push(chunk);
    bus.emit("chunk", chunk);
  };

  // M8: the server id is a control signal — mark transient so the client never
  // folds it into message.parts (and it never round-trips into model history).
  emit({ type: "data-assistant-id", data: assistantId, transient: true });

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
  const settleTimer = setTimeout(() => {
    if (!settled && !ctrl.signal.aborted) {
      logWarn(`generation ${assistantId} exceeded ${settleTimeoutMs}ms — force-settling`);
      try {
        ctrl.abort();
      } catch {}
    }
  }, settleTimeoutMs);

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
          emit({ type: "error", error: errMsg(err) });
        },
      })) as AsyncIterable<UIMessageStreamChunk>;
      for await (const chunk of merged) {
        acc.push(chunk);
        emit(chunk);
        committed = committed || isGenerationContent(chunk);
        void maybePersistProgressive(); // throttled; serialized by the write chain
      }
    } catch (err) {
      attemptError = attemptError ?? errMsg(err);
    }
    return { error: attemptError };
  };

  const done = (async () => {
    try {
      if (!makeResult) {
        emit({ type: "error", error: "missing generation source" });
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
        let r: any;
        try {
          r = await makeResult();
        } catch (err) {
          outcome = { error: errMsg(err) };
          break;
        }
        lastResult = r;
        outcome = await driveAttempt(r);

        if (ctrl.signal.aborted) {
          generationAborted = true;
          await finalizePartial();
          return;
        }
        // Retry ONLY a terminal, content-free attempt (empty completion or an
        // error before a single token/tool landed). committed → break (keep
        // the partial, end turn) — never re-run a side-effecting turn.
        if (committed || attempt >= maxAttempts) break;

        // Client-visible "Retrying in Ns · attempt x/y" (docs retry-progress UX).
        emit({
          type: "retry",
          attempt,
          maxRetries: maxAttempts - attempt,
          delayMs: retryBackoffMs,
          transient: true,
        });
        await new Promise((res) => setTimeout(res, retryBackoffMs * attempt));
        attempt += 1;
      }

      if (ctrl.signal.aborted) {
        generationAborted = true;
        await finalizePartial();
        return;
      }

      if (committed) {
        // Stream produced output (or was finalized) → canonical completed status.
        const finalParts = normalizeUIMessageParts(
          Array.isArray(await lastResult.parts) ? await lastResult.parts : acc.parts(),
        ) as unknown[];
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
        void recordUsage(
          toUsageInput(chatId, userId, (model as string) ?? "", usage, Date.now() - genStart),
        ).catch(() => {});
      } else {
        // Exhausted every attempt with no output → keep the (empty) partial as
        // completed + surface the failure. Stuck generation → settle timer aborts.
        emit({ type: "error", error: outcome?.error ?? "Generation produced no output." });
        await finalizePartial();
      }
    } catch (err) {
      generationAborted = ctrl.signal.aborted;
      emit({ type: "error", error: errMsg(err) });
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