"use client";

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useChat, type UseChatHelpers } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { nanoid } from "nanoid";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { getDefaultChatModel, getModelById, isImageModel } from "@/lib/ai/models";
import type { ReasoningLevel } from "@/lib/nim";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";
import { dropOrphanToolParts } from "@/lib/chat-repair";
import {
  sanitizeMessageForStorage,
  persistImagesForMessage,
  type ImageCacheEntry,
} from "@/lib/image-cache";
import { normalizeUIMessageParts } from "@/lib/ai/message-parts";
import { RunLeases } from "@/lib/run-leases";
import { isPendingApprovalPart } from "@/lib/approval-target";
import {
  createSerialRunQueue,
  SerialRunQueueDropError,
} from "@/lib/serial-run-queue";
import { getInvokedSkillBodies } from "@/lib/skill-store";
import { getEnabledMcpServers } from "@/lib/mcp-config";
import { useSettingsStore } from "@/hooks/use-settings-store";
import { useSkillLibrary } from "@/hooks/use-skill-library";
import {
  stashPendingMessage,
  takePendingMessage,
  hasPendingMessage,
  type PendingPart,
} from "@/lib/draft-chat";
import type { ArtifactKind, ChatMessage } from "@/lib/types";

/**
 * useActiveChat — leopard's adaptation of vercel-chatbot's use-active-chat.
 *
 * Wires @ai-sdk/react's useChat to the Phase 4 /api/chat route with
 * CLIENT-side Convex persistence (deliberate deviation from vercel-chatbot's
 * server-side save — see the Phase 4 chat-route memory: the route only
 * auth-gates + streams; the client owns persistence to avoid a server-Convex
 * auth hole until Phase 9 hardening).
 *
 *   - transport: DefaultChatTransport whose prepareSendMessagesRequest sends
 *     { id, messages, model } — the FULL messages array (matches /api/chat's
 *     Zod schema, NOT vercel-chatbot's last-message-only body).
 *   - onData: captures the route's `data-chat-title` custom part and persists
 *     the title via api.chats.updateTitle (route generates it on first
 *     exchange only).
 *   - persistence effect: dedup-by-id, fire-and-forget api.messages.send for
 *     new user messages (immediate) + the assistant message (once status ===
 *     "ready"); api.chats.touch on assistant finish. Regenerate is deferred
 *     to Phase 6 (needs deleteAfterTimestamp truncation to avoid Convex
 *     orphans), so no regenerate button in the Phase 5 shell.
 *
 * URL param `[chatId]` is the Convex `_id` (sidebar hard-codes it; the
 * eager-create flow in app/(chat)/chat/page.tsx mints the row up-front), so
 * useChat's internal `id` uses that Convex id as the stable session key — no
 * client-UUID migration side-quest. The page mounts the provider with
 * `key={chatId}` so a chat switch is a clean remount (refs reset).
 *
 * TEMP: when BYPASS_CLERK is on (Phase 5 browser E2E — see lib/dev-user.ts),
 * uid falls back to DEV_USER_ID so a fresh unauth'd browser can run the full
 * flow. Revert before Phase 9.
 */

/**
 * The artifact side-panel state. `null` when no artifact is active; the panel
 * renders null in that case. `status: "streaming"` while a createDocument call
 * is emitting `data-*Delta` parts; `"idle"` after `data-finish` (content has
 * been persisted to Convex via api.documents.save). `isVisible:false` lets the
 * panel animate out without dropping the doc state mid-stream.
 */
export type UIArtifact = {
  documentId: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  status: "streaming" | "idle";
  isVisible: boolean;
};

type ActiveChatContextValue = UseChatHelpers<ChatMessage> & {
  /** Convex chat row (title, model, shared…). null = not found / not owned. */
  chatMeta: Doc<"chats"> | null;
  /** True while the Convex chat + messages queries are still loading. */
  isLoading: boolean;
  /** Selected model id for THIS chat (server-side /api/chat reads it from body). */
  currentModelId: string;
  /** Change model (local state + persist via api.chats.updateModel). */
  setCurrentModel: (id: string) => void;
  /** Selected reasoning level for THIS chat (per-model, persisted client-side). */
  currentReasoning: ReasoningLevel | undefined;
  /** Change reasoning level (local state + localStorage persistence). */
  setReasoning: (level: ReasoningLevel) => void;
  /** Active artifact side-panel state (null = none). Φ6. */
  artifact: UIArtifact | null;
  /** Close/clear the artifact panel. Φ6. */
  setArtifact: (a: UIArtifact | null) => void;
    /** Abort the current server-owned generation (persist partial) then stop the local stream. */
  stopGeneration: () => void;
  /** True at /chat before the first send — no Convex row exists yet. */
  isDraft: boolean;
  /** Regenerate an assistant reply: deletes the old server row FIRST (else the
   * live-mirror resurrects it next to the new reply), then SDK-regenerates. */
  regenerateMessage: (messageId: string) => void;
  /** Edit a user message: deletes server rows at-or-after it FIRST (else the
   * live-mirror resurrects them and the edited resend duplicates the old
   * bubble), then truncates local state so the resend starts clean. */
  /** Truncates at the message; resolves when the server rows are deleted. */
  editMessage: (messageId: string) => Promise<unknown>;
  /** Edit + immediately resend (truncates, waits for the send gate, sends). */
  editAndResend: (messageId: string, text: string) => void;
  /** Approve/deny a tool call and fire the resume POST once the SDK gate
   * opens (provider-lived; survives the dock unmounting on approval). The
   * optional `reason` carries a structured answer — the askUser card puts the
   * chosen option there so the resumed model reads it. */
  approveAndResume: (approvalId: string, approved: boolean, reason?: string) => void;
  /** True when the latest assistant row is still being written by the
   * detached server task and no local stream owns it — i.e. the user reopened
   * the chat mid-generation and is watching the live mirror fill in. */
  serverStreaming: boolean;
  /** A pending approval read from the SERVER row (streaming + approval-requested
   * part) — the fallback when the SDK bubble already settled (the SDK ends its
   * stream on an unresolved gate, so its status flips ready while the server
   * still holds the turn). */
  pendingServerApproval: { approvalId: string; toolName: string; input?: unknown } | null;
  /** Prior response texts for the turn this assistant message answers
   * (session-scoped regen history; the server rows are deleted on regen). */
  getSiblings: (messageId: string) => string[];
  /** True during the auto-retry pause after an errored run (QA M5) — lets the
   * composer show the stop state while the retry is pending/in-flight. */
  retrying: boolean;
  /** Human-readable reason the last turn errored (drives the error-card copy).
   *  Empty when there's no error. */
  lastErrorReason: string;
  /** Transient "reconnecting/switching model" signal while the server retries a
   *  stalled upstream. Null when the stream is flowing normally. */
  stallSignal: { attempt: number; maxRetries: number; delayMs: number } | null;
  /** Set when the route compacted old history into a summary this turn. */
  compactionNotice: boolean;
  dismissCompactionNotice: () => void;
};

const ActiveChatContext = createContext<ActiveChatContextValue | null>(null);

/** Convert a Convex message doc → a hydratable UIMessage (parts source of truth). */
function toChatMessage(m: Doc<"messages">): ChatMessage {
  return {
    id: m.id ?? String(m._id),
    role: m.role,
    // Server lifecycle rides metadata so the UI can mark a row still being
    // written by the detached route (reload/reopen mid-generation). createdAt
    // rides too — the day separators stamp first-render time otherwise, so a
    // reloaded history all landed under "Today" (audit 2026-10-12).
    metadata: {
      ...(m.status === "streaming" ? { serverStreaming: true } : {}),
      ...(typeof m.createdAt === "number" ? { createdAt: m.createdAt } : {}),
    } as ChatMessage["metadata"],
    // Normalize persisted parts (legacy `tool-*` / `step-start` are invalid in
    // the v7 UIMessage schema and would otherwise throw on reload→send —
    // lib/ai/message-parts).
    parts: normalizeUIMessageParts(
      m.parts ?? (m.content ? [{ type: "text", text: m.content }] : []),
    ) as ChatMessage["parts"],
  };
}

// ── Resumable-stream re-attach (sessionStorage pending-stream tracking) ──────
// The POST route stamps `x-resumable-stream-id: <assistantId>` on a generation-
// bearing response (app/api/chat/route.ts §8c). The transport's fetch wrapper
// records it here, per chat. On remount (reload mid-generation) the mount
// effect re-attaches to the live SSE via chat.resumeStream() → GET
// /api/chat/[chatId]/stream, which re-subscribes to the in-process generation
// bus. sessionStorage (not localStorage): the marker must survive a RELOAD but
// die with the tab — a brand-new tab opening the same chat goes through the
// mirror fallback instead of stealing the stream.
const PENDING_STREAM_KEY_PREFIX = "leopard:pending-stream:";

function readPendingStreamId(chatId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(PENDING_STREAM_KEY_PREFIX + chatId);
  } catch {
    return null; // private mode / quota — the mirror fallback still covers reloads
  }
}

function writePendingStreamId(chatId: string, streamId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_STREAM_KEY_PREFIX + chatId, streamId);
  } catch {
    /* ignore — mirror fallback */
  }
}

function clearPendingStreamId(chatId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_STREAM_KEY_PREFIX + chatId);
  } catch {
    /* ignore */
  }
}

export function ActiveChatProvider({
  chatId,
  children,
}: {
  chatId: string;
  children: ReactNode;
}) {
  const { user } = useUser();
  const router = useRouter();
  // TEMP: DEV_USER_ID fallback when BYPASS_CLERK is on (Phase 5 browser E2E).
  const uid: string | undefined = user?.id ?? (BYPASS_CLERK ? DEV_USER_ID : undefined);
  // Deferred-create: /chat mounts the provider with "draft" — NO Convex row
  // exists yet (kills the empty-chat-on-every-visit bug). All queries/mutations
  // skip; the first send mints the row, stashes the parts, and routes to
  // /chat/<realId> where the remounted provider picks the pending message up.
  const isDraft = chatId === "draft";
  // QA m6: a malformed id (typed URL) fails Convex arg validation and the
  // query error used to leave a silent empty/crashed view — treat it as
  // not-found instead. Convex ids are lowercase base32-ish strings.
  const badId = !isDraft && !/^[a-z0-9]{16,64}$/.test(chatId);
  const convexChatId = chatId as Id<"chats">;

  // ── Convex: load chat + messages ──────────────────────────────────────────
  const chatMetaRaw = useQuery(
    api.chats.get,
    isDraft || badId || !uid ? "skip" : { chatId: convexChatId, userId: uid },
  );
  const chatMeta = badId ? null : chatMetaRaw;
  const convexMessages = useQuery(
    api.messages.list,
    isDraft || badId ? "skip" : { chatId: convexChatId },
  );
  // Latest-rows ref for event handlers (stopGeneration) that mustn't re-bind
  // on every mirror patch.
  const convexMessagesRef = useRef(convexMessages);
  convexMessagesRef.current = convexMessages;
  const createChat = useMutation(api.chats.create);

  // Φ-skill-library — seed + load curated skills into the shared store so the
  // +→add-skill modal can render them and the transport injects their bodies.
  useSkillLibrary();

  // ── Convex: mutations (stable refs from useMutation) ──────────────────────
  const messagesSend = useMutation(api.messages.send);
  const deleteAfterTimestamp = useMutation(api.messages.deleteAfterTimestamp);
  const updateTitle = useMutation(api.chats.updateTitle);
  const updateModel = useMutation(api.chats.updateModel);
  const touchChat = useMutation(api.chats.touch);
  const settleStreaming = useMutation(api.messages.settleStreaming);
  const respondToApproval = useMutation(api.messages.respondToApproval);
  // Φ6: persist assembled artifact doc on stream finish (client-persist —
  // route has no ConvexHttpClient by design; mirrors messages.send pattern).
  const documentsSave = useMutation(api.documents.save);

  // ── Selected model ─────────────────────────────────────────────────────────
  // QA m2: draft/new chats default to the LAST picked model (localStorage),
  // not always the registry default — a reload used to silently reset the
  // user's pick. Real chats still sync from chatMeta (row wins).
  const [currentModelId, setCurrentModelIdState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const last = window.localStorage.getItem("leopard:last-model");
        if (last && getModelById(last)) return last;
      } catch {
        /* ignore quota / private mode */
      }
    }
    return getDefaultChatModel().id;
  });
  // Sync ONCE from the loaded chat (race-guard: don't clobber a user pick made
  // before chatMeta arrived). Provider is keyed by chatId, so the ref resets on
  // every chat switch — first sync is the saved chat model.
  const hasSyncedModelRef = useRef(false);
  useEffect(() => {
    if (chatMeta?.model && !hasSyncedModelRef.current) {
      hasSyncedModelRef.current = true;
      // A model removed from the registry (e.g. minimax-m3 dropped 2026-08-31)
      // would fail the route's allowlist with a 400 — fall back to default.
      setCurrentModelIdState(
        getModelById(chatMeta.model) ? chatMeta.model : getDefaultChatModel().id,
      );
    }
  }, [chatMeta?.model]);
  // Ref so the transport (created once) reads the latest model without
  // re-constructing itself on every model change.
  const currentModelIdRef = useRef(currentModelId);
  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  // ── Selected reasoning level (per-chat, persisted client-side) ────────────
  // Per-chat scoping (user bug 2026-08-26: setting LOW in chat B flipped the
  // badge in chat A that was set HIGH — the per-model key leaked across
  // chats). Real chats read/write `leopard:reasoning:<chatId>:<modelId>`;
  // the DRAFT (/chat pre-first-send) reads/writes the per-model default key,
  // which is also the fallback the first time a real chat is seen. undefined
  // for models with no reasoning knob (route then omits the param).
  // useCallback (perf 2026-10-10): setReasoning's deps include this.
  const reasoningKey = useCallback(
    (mid: string, cid?: string) =>
      cid && cid !== "draft"
        ? `leopard:reasoning:${cid}:${mid}`
        : `leopard:reasoning:${mid}`,
    [],
  );
  const resolveReasoningFor = (mid: string, cid?: string): ReasoningLevel | undefined => {
    const cfg = getModelById(mid)?.reasoningConfig;
    if (!cfg?.enabled || !cfg.toggleable || !cfg.param) return undefined;
    // Valid levels for this card (audit 2026-10-08): a stale localStorage value
    // from an older effort set (e.g. "medium" on a low/high/max-only model, or
    // "off" on an off-unsupported card) used to ride the request and NIM either
    // 400'd the turn or silently thought anyway.
    const valid = new Set<string>([
      ...(cfg.offSupported === false ? [] : ["off"]),
      "on",
      ...(cfg.effortLevels ?? []),
    ]);
    const read = (key: string): ReasoningLevel | undefined => {
      const v = window.localStorage.getItem(key);
      return v && valid.has(v) ? (v as ReasoningLevel) : undefined;
    };
    try {
      if (cid && cid !== "draft") {
        const chatSaved = read(reasoningKey(mid, cid));
        if (chatSaved) return chatSaved;
      }
      const saved = read(reasoningKey(mid));
      if (saved) return saved;
    } catch {
      /* ignore quota / private mode */
    }
    return cfg.defaultEffort;
  };
  const [currentReasoning, setCurrentReasoning] = useState<
    ReasoningLevel | undefined
  >(() => (typeof window === "undefined" ? undefined : resolveReasoningFor(currentModelId, chatId)));
  const currentReasoningRef = useRef(currentReasoning);
  useEffect(() => {
    currentReasoningRef.current = currentReasoning;
  }, [currentReasoning]);
  // Re-resolve reasoning when the model switches (recall this CHAT's saved
  // pick first, then the model-level default for unseen chats).
  /* eslint-disable react-hooks/exhaustive-deps -- intentionally runs only on
     model switch; resolveReasoningFor is a pure localStorage reader and must
     not trigger a re-run on every render. */
  useEffect(() => {
    setCurrentReasoning(resolveReasoningFor(currentModelId, chatId));
  }, [currentModelId]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // `uid` ref: useChat binds onData/onError at Chat construction; read the
  // latest uid via ref so a SessionLoaded → signed-in transition still
  // persists the title. Falls back to DEV_USER_ID under BYPASS_CLERK.
  const uidRef = useRef(uid);
  useEffect(() => {
    uidRef.current = uid;
  }, [uid]);

  // Φ10 / #3 — the assistant message id the SERVER persists under. The route
  // emits `data-assistant-id` as its first (transient) chunk; we adopt it so
  // votes + suggestions bind to the persisted row (not a ghost optimistic id).
  // Ref keeps the stable onData/persist closures reading the latest value; the
  // adoption itself runs in the live-mirror effect below (review M3).
  const serverAssistantIdRef = useRef<string | null>(null);

  // A cancelled turn whose server row is still being patched. Late tool-call
  // frames from that turn must land on THIS bubble, not bleed into whatever
  // turn the user started next.
  const settlingAssistantIdRef = useRef<string | null>(null);

  // Last stream activity timestamp for the hung-request watchdog (declared
  // before useChat so onData can bump it — see the watchdog effect below).
  const lastActivityRef = useRef(Date.now());

  // Regen history: prior assistant texts keyed by the PRECEDING USER message id
  // (regen mints a new assistant id, so keying by assistant id would orphan the
  // history). Session-scoped — Convex keeps only the latest reply by design.
  const [siblings, setSiblings] = useState<Record<string, string[]>>({});
  // (Whole-run timing display removed 2026-09-02 — see reasoning panel.)

  // ── Φ6: Artifact side-panel state ──────────────────────────────────────────
  // `artifact` is the panel-visible state; the refs below accumulate the
  // full document content across per-token data-*Delta parts (state updates
  // are batched/async; refs are read synchronously inside onData so deltas
  // don't race). On `data-finish` the accumulated content is persisted to
  // Convex via api.documents.save, mirroring the messages client-persist flow.
  const [artifact, setArtifactState] = useState<UIArtifact | null>(null);
  const setArtifact = useCallback((a: UIArtifact | null) => {
    setArtifactState(a);
  }, []);
    // Accumulate the full doc content across deltas — refs are read sync inside
  // onData (state is async-batched → would race per-token). Plus id/kind/title
  // so the finish persist closure has everything without depending on state.
  const artifactContentRef = useRef("");
  const artifactIdRef = useRef<string>("");
  const artifactKindRef = useRef<ArtifactKind>("text");
  const artifactTitleRef = useRef<string>("");

  // ── Transport (stable for the provider's life) ────────────────────────────
  // eslint-disable react-hooks/refs -- the transport closure reads the model +
  // reasoning refs at sendMessage time (an event handler), not during render;
  // the useMemo factory itself never touches a ref. Stability is required so
  // useChat doesn't re-bind listeners on every model/pick change.
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: "/api/chat",
        // Φ-guard (2026-09-01): drop `tool-approval-request` chunks whose
        // toolCallId was never seen (stale chunk from a retried/duplicated
        // server attempt). The SDK hard-throws on them ("Tool call … not
        // found for approval request"), killing the stream mid-turn. Known
        // ids = every tool part in the outgoing history + every tool chunk
        // seen earlier in THIS response.
        fetch: (async (url: RequestInfo | URL, options?: RequestInit) => {
          const known = new Set<string>();
          // The outgoing chat id (body.id) — scopes the pending-stream marker
          // written from the response header below. The resume GET has no
          // body, so it never lands here with a chatId (can't clobber).
          let wireChatId: string | null = null;
          try {
            const body = JSON.parse(String(options?.body ?? "{}")) as {
              id?: unknown;
              messages?: Array<{ parts?: Array<{ toolCallId?: string }> }>;
            };
            if (typeof body.id === "string" && body.id.length > 0)
              wireChatId = body.id;
            for (const m of body.messages ?? [])
              for (const p of m.parts ?? [])
                if (typeof p?.toolCallId === "string") known.add(p.toolCallId);
          } catch {
            /* body parse is best-effort */
          }
          let res: Response;
          try {
            res = await fetch(url, options);
          } catch (e) {
            console.error("[transport] fetch failed:", e);
            throw e;
          }
          // Resumable-stream re-attach: the route stamps the persisted
          // assistant row id on every generation-bearing POST response. Record
          // it so a reload mid-generation can re-attach (mount effect below).
          // Absent on errors / the image-gen branch / approval-resume posts →
          // keep whatever is stored.
          if (wireChatId) {
            const streamId = res.headers.get("x-resumable-stream-id");
            if (streamId) writePendingStreamId(wireChatId, streamId);
          }
          const ct = res.headers.get("content-type") ?? "";
          if (!res.body || !ct.includes("text/event-stream")) return res;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          const encoder = new TextEncoder();
          const filtered = new ReadableStream<Uint8Array>({
            async start(controller) {
              let buf = "";
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                  if (line.startsWith("data:")) {
                    try {
                      const chunk = JSON.parse(line.slice(5).trim()) as {
                        type?: string;
                        toolCallId?: string;
                      };
                      if (
                        typeof chunk.toolCallId === "string" &&
                        chunk.type !== "tool-approval-request"
                      )
                        known.add(chunk.toolCallId);
                      if (
                        chunk.type === "tool-approval-request" &&
                        typeof chunk.toolCallId === "string" &&
                        !known.has(chunk.toolCallId)
                      ) {
                        continue; // drop the dangling chunk
                      }
                    } catch {
                      /* unparseable line passes through */
                    }
                  }
                  controller.enqueue(encoder.encode(line + "\n"));
                }
              }
              if (buf) controller.enqueue(encoder.encode(buf));
              // Clean SSE end → the turn settled on the wire (the POST route
              // holds the response open until the detached generation is done).
              // Drop the re-attach marker. An abort / tab close mid-stream
              // skips this — exactly when the marker must survive for the
              // mount re-attach.
              if (wireChatId) clearPendingStreamId(wireChatId);
              controller.close();
            },
          });
          return new Response(filtered, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });
        }) as typeof fetch,
        prepareSendMessagesRequest: ({ id, messages, body }) => ({
          body: {
            id,
            // FULL history — /api/chat validates + converts via convertToModelMessages.
            // Normalize parts so even a live in-memory message holding legacy
            // `tool-*`/`step-start` parts still validates on the wire.
            messages: messages.map((m) => ({
              ...m,
              parts: normalizeUIMessageParts(m.parts),
            })),
            model:
              typeof (body as { model?: unknown } | undefined)?.model === "string"
                ? ((body as { model: string }).model)
                : currentModelIdRef.current,
            // Per-model reasoning level (undefined for locked-on/no-knob models
            // → route omits the key → NIM non-think / no param). Route.ts reads
            // this + nimReasoningProviderOptions() builds providerOptions.nim.
            reasoning: currentReasoningRef.current,
            // Φ-skill-library — slash-gated: only skills the user invoked with
            // `/<slug>` in THIS message inject (e.g. `/frontend-design …`). No
            // invocation → no skill bodies → no per-request token cost (NIM has
            // no prompt caching, so always-on injection was a pure tax).
            skills: getInvokedSkillBodies(lastUserText(messages)),
            // MCP panel → route bridge (2026-09-04): the panel's localStorage
            // config used to die client-side (route only read env). Enabled
            // servers ride the request body; the route validates + merges them
            // with LEOPARD_MCP_SERVERS (env wins on name collision).
            mcpServers: getEnabledMcpServers(),
            // Web fetch master toggle (composer + menu). Default ON — the
            // route hardcodes the tool; false retracts it for this send.
            // getState() read at send time (event handler), so the memoized
            // transport never goes stale.
            webFetch: useSettingsStore.getState().webFetchEnabled,
          },
        }),
      }),
    [],
  );
  // eslint-enable react-hooks/refs

  // ── useChat ───────────────────────────────────────────────────────────────
  //
  // Slash-invocation source: the text of the LAST user message in the outgoing
  // batch (the one just sent). Only its `/slug` tokens gate skill injection.
  function lastUserText(list: ChatMessage[]): string {
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.role !== "user") continue;
      return (m.parts ?? [])
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");
    }
    return "";
  }

  const chat = useChat<ChatMessage>({
    id: chatId,
    generateId: nanoid,
    transport,
    // Batch store notifications to ~10fps: an unthrottled per-chunk notify
    // storm could cascade past React's nested-update limit (forceStoreRerender
    // re-queues mid-commit) and kill the whole turn with "Maximum update depth
    // exceeded" (2026-09-02). Rendering is already throttle-aware downstream
    // (StreamingText 48ms), so visual smoothness is unchanged.
    experimental_throttle: 100,
    onError: (error) => {
      // Φ-hardening: never surface a cryptic engine/parse message (nobody can
      // act on "Syntax error in text…", "Session creation failed", empty-content
      // 400s, or protocol mismatches). Log the raw detail for diagnostics, show
      // a concise human toast. Recognized noise → targeted copy; unknown → a
      // generic retry prompt.
      console.error("[chat] stream error:", error);
      // Record the raw message for the non-retryable check in the auto-retry
      // effect (a dead-key 403 must not auto-retry into the same wall) and for
      // the error-card copy.
      const rawErr = String((error as Error)?.message ?? error ?? "");
      lastErrorRef.current = rawErr;
      setLastErrorReason(rawErr);
      // Orphan tool parts (terminated mid-call) poison the NEXT send with
      // "Tool result is missing for tool call". Purge ONLY on that exact
      // failure — purging eagerly can race a landing approval-request part
      // and dangle it ("Tool call not found for approval request").
      if (/Tool result is missing for tool call/i.test(String((error as Error)?.message ?? error ?? ""))) {
        try {
          chat.setMessages((prev) => dropOrphanToolParts(prev));
        } catch {
          /* non-fatal */
        }
      }
      const raw = String((error as Error)?.message ?? error ?? "");
      const noise: Array<[RegExp, string]> = [
        [/Empty content is not allowed|empty.*(content|response)|AIMessageEmpty/,
          "The model returned an empty response — try asking again."],
        [/Syntax error in text|Parse error on line/, "A diagram in the reply couldn’t be rendered — shown as its source."],
        [/Protocol|stream.*(mismatch|interrupted|error)|Response body is empty/,
          "The response stream was interrupted — check your connection and retry."],
        [/[Vv]alidat(e|ion)|did not match|Expected.*received|zod|Schema|Unexpected part/,
          "The reply didn’t match the expected format — try asking again."],
        [/Session creation failed|rate.?limit|429/,
          "Too many requests right now — wait a moment and retry."],
        [/API key|401|Authentication/,
          "Model authentication failed — check your API credentials."],
      ];
      const hit = noise.find(([re]) => re.test(raw));
      toast.error(hit ? hit[1] : "Something went wrong streaming the response — try again.");
    },
    onData: (part) => {
      // Hung-request watchdog activity: ANY stream chunk (incl. artifact
      // data-* parts, which never touch chat.messages) proves the wire is
      // alive. Without this a >75s prelude (createDocument streaming into the
      // panel, no message parts) read as "hung" and got aborted (X4.2).
      lastActivityRef.current = Date.now();
      // Φ10 / #3: route emits the persisted assistant id as its first chunk
      // (transient). ONLY record it here — the optimistic bubble is not yet in
      // chat.messages at onData time (write() runs after), so any rename attempt
      // here is a no-op (review M3). Actual id adoption happens in the settle /
      // live-mirror effect below, once the stream leaves `streaming` and the
      // bubble actually exists as the trailing message.
      if ((part as { type?: string }).type === "data-assistant-id") {
        serverAssistantIdRef.current = (part as { data?: string }).data ?? null;
        return;
      }
      // Server signalled a stall→retry/fallback (data-retry). Surface it as a
      // transient "reconnecting" chip so a hung upstream doesn't read as a
      // frozen "Working on it…" (audit 2026-10-06 — kimi hang gave zero signal
      // for 40s+). Cleared on the next real content chunk / stream end.
      // (Cast: data-retry isn't in the SDK's known data-part union.)
      if ((part as { type?: string }).type === "data-retry") {
        const d = (part as { data?: { attempt?: number; maxRetries?: number; delayMs?: number } }).data;
        const next = {
          attempt: d?.attempt ?? 1,
          maxRetries: d?.maxRetries ?? 1,
          delayMs: d?.delayMs ?? 0,
        };
        stallSignalRef.current = next;
        setStallSignal(next);
        return;
      }
      // data-compaction (audit 2026-10-09, deep-sweep #13): the route folds old
      // history into a summary when LEOPARD_CONTEXT_COMPACT=1; the client had
      // NO case for it → context silently shrank with zero user signal. Show a
      // dismissible notice chip (mirrors the stall-chip pattern).
      if ((part as { type?: string }).type === "data-compaction") {
        setCompactionNotice(true);
        return;
      }
      // Real content flowing again → drop the "reconnecting" stall chip.
      if (stallSignalRef.current) {
        stallSignalRef.current = null;
        setStallSignal(null);
      }

      // Φ5: route emits { type: "data-chat-title", data: "<title>" } on the
      // first exchange. Persist it; cosmetic, so swallow failures silently.
      if (part.type === "data-chat-title") {
        const u = uidRef.current;
        if (!u) return;
        // Log rather than swallow blind: an ownership mismatch here is the
        // difference between "title is stale" and "title is silently broken".
        // The server-side setTitleIfUntitled is the durable path either way.
        void updateTitle({ chatId: convexChatId, userId: u, title: part.data }).catch(
          (err) =>
            console.warn("[title] client persist failed:", String(err).slice(0, 200)),
        );
        return;
      }

      // Φ6: artifact lifecycle + streaming content parts. The createDocument
      // tool emits kind→id→title→clear→(textDelta×N)→finish. We accumulate
      // content in a ref (per-token state updates would batch + race), mirror
      // it into state for the panel to render live, and persist the assembled
      // document to Convex on finish. code/sheet/image handlers ship in the
      // next increment; their *Delta parts are swallowed here until then.
      switch (part.type) {
        case "data-kind": {
          artifactKindRef.current = part.data;
          setArtifactState((a) => ({
            documentId: a?.documentId ?? "",
            title: a?.title ?? "",
            kind: part.data,
            content: a?.content ?? "",
            status: "streaming",
            isVisible: true,
          }));
          return;
        }
        case "data-id": {
          artifactIdRef.current = part.data;
          setArtifactState((a) =>
            a
              ? { ...a, documentId: part.data, status: "streaming" }
              : {
                  documentId: part.data,
                  title: "",
                  kind: artifactKindRef.current,
                  content: "",
                  status: "streaming",
                  isVisible: true,
                },
          );
          return;
        }
        case "data-title": {
          artifactTitleRef.current = part.data;
          setArtifactState((a) =>
            a
              ? { ...a, title: part.data, status: "streaming" }
              : {
                  documentId: artifactIdRef.current,
                  title: part.data,
                  kind: artifactKindRef.current,
                  content: "",
                  status: "streaming",
                  isVisible: true,
                },
          );
          return;
        }
        case "data-clear": {
          artifactContentRef.current = "";
          setArtifactState((a) =>
            a ? { ...a, content: "", status: "streaming" } : a,
          );
          return;
        }
        case "data-textDelta": {
          // Accumulate via ref (sync), then push to state for live render.
          artifactContentRef.current += part.data;
          const snapshot = artifactContentRef.current;
          setArtifactState((a) =>
            a
              ? { ...a, content: snapshot, status: "streaming" }
              : {
                  documentId: artifactIdRef.current,
                  title: artifactTitleRef.current,
                  kind: artifactKindRef.current,
                  content: snapshot,
                  status: "streaming",
                  isVisible: true,
                },
          );
          return;
        }
        case "data-finish": {
          const u = uidRef.current;
          const id = artifactIdRef.current;
          const kind = artifactKindRef.current;
          const title = artifactTitleRef.current;
          const content = artifactContentRef.current;
          setArtifactState((a) => (a ? { ...a, status: "idle" } : a));
          // Persist the assembled document version. Fire-and-forget; failures
          // are cosmetic (panel still shows the streamed content) — toast to
          // surface persistence problems without crashing the stream.
          if (u && id) {
            void documentsSave({
              id,
              title: title || "Untitled",
              kind,
              content,
              userId: u,
            }).catch(() => toast.error("Failed to save artifact"));
          }
          return;
        }
        // codeDelta / sheetDelta / imageDelta / suggestion land here until
        // their handlers ship; ignore (no panel for those kinds yet).
        default:
          return;
      }
    },
  });

  // ── Hydrate once per chat (Convex → useChat) ──────────────────────────────
  // hydratedRef guards against re-hydrating on Convex refetches (every
  // messages.send we fire re-triggers api.messages.list). The provider's
  // key={chatId} already resets refs on switch; this is the in-mount guard.
  const hydratedRef = useRef(false);
  const persistedIdsRef = useRef<Set<string>>(new Set());
  // Reconcile, never clobber: Convex rows in server order first, then any
  // local-only messages (optimistic user bubble from the draft handoff that
  // hasn't persisted yet, a live assistant bubble) appended by id. A blind
  // setMessages(convexRows) wiped the in-flight user message when hydration
  // resolved AFTER the deferred-create pickup had already sent it — the user
  // bubble vanished, the approval-resume POST went out assistant-only
  // ("messages must not be empty"), and the mirror re-added colliding ids.
  const reconcile = (
    local: typeof chat.messages,
    server: typeof convexMessages,
  ): typeof chat.messages => {
    const rows = (server ?? []).map(toChatMessage);
    const seen = new Set(rows.map((r) => r.id));
    const localOnly = local.filter((m) => !seen.has(m.id));
    return [...rows, ...localOnly];
  };
  useEffect(() => {
    if (isDraft || !convexMessages || hydratedRef.current) return;
    hydratedRef.current = true;
    const next = reconcile(chat.messages, convexMessages);
    // Only SERVER rows count as persisted — a local-only optimistic user
    // message (draft handoff) must still hit the persist effect below.
    for (const m of convexMessages.map(toChatMessage)) persistedIdsRef.current.add(m.id);
    chat.setMessages(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convexMessages, chat.setMessages]);

  // Approval-resume in-flight flag (declared here — the mirror/dedupe effects
  // below read it). STATE, not a ref (2026-09-05 RCA): the release flips AFTER
  // the resume stream drains; a ref flip is invisible to React, so dedupe never
  // re-ran and the pre-approval + resume bubbles BOTH stayed in state
  // (duplicated thinking/tool cards until reload).
  const [resumeInFlight, setResumeInFlight] = useState(false);
  // Generation fence for resume races: a stale resume window never no-ops the
  // mirror while a newer run is active.
  const resumeLeases = useRef(new RunLeases());
  const startLeases = useRef(new RunLeases());

  // ── Serial turn queue (leopard react-langgraph SerialRunQueue, 2026-10-15) ─────
  // At most one SDK turn is in flight. A send/regenerate/edit-resend that lands
  // while a turn runs waits for it instead of racing it (the SDK's own guard
  // makes a second concurrent send a silent no-op, so the user saw "sent" and
  // nothing happened). Back-to-back sends form ONE running window — the queue
  // only reports idle once nothing else is queued, so the composer can't
  // flicker send→stop→send mid-typing. stopGeneration() drops whatever is
  // queued and leaves the live turn to settle.
  const turnQueueRef = useRef(
    createSerialRunQueue({
      run: async (send: () => Promise<unknown>) => {
        await send();
      },
    }),
  );

  // ── Φ10 / #3: live-mirror the SERVER-written assistant rows into the view ─
  // Covers reload-mid-generation: after remount, the `streaming`/`completed`
  // row (written by the detached route task) appears in Convex; as the task
  // patches it, useQuery re-fires and we append/update that bubble live — so a
  // reloaded page shows the reply filling in without a manual refresh.
  // Skipped while a LOCAL stream is live (`streaming`) so the optimistic bubble
  // isn't ghosted by the server row — the two share an id (data-assistant-id),
  // so once the stream settles, this mirrors parts in place with no duplicate.
  useEffect(() => {
    if (!convexMessages) return;
    if (editWindowRef.current) return; // edit→delete→resend in flight
    if (chat.status === "streaming" || chat.status === "submitted") return;
    // Approval-resume window: the user clicked Allow/Deny but the resume POST
    // hasn't started. The persisted row still says approval-requested, so a
    // mirror pass here would CLOBBER the SDK's approval-responded state and
    // the dock's resend would no-op — dead turn (probe 2026-09-04).
    // Stand down only while a resume POST is actually in flight (the window
    // between the Allow/Deny click and the resume stream). Do NOT key this off
    // the part state: after a reload mid-resume the persisted placeholder row
    // IS approval-responded, and the guard would lock forever — the row never
    // updates to output-available and the card hangs on "Writing" (X4.2 RCA).
    // Lease check: a stale lease from a superseded resume never keeps the
    // mirror closed.
    if (resumeInFlight && resumeLeases.current.current().isCurrent()) return;
    // Same loop guard as the dedupe effect: never call setMessages when nothing
    // changed — the store notify alone refires this effect (chat.messages
    // identity churn) → infinite loop (2026-09-06).
    {
      const prev = chat.messages;
      let changed = false;
      const next = prev.slice();

      // ── Φ10/#3 review M3: adopt the server id BY POSITION once the stream
      // settles. onData runs before the optimistic bubble exists, so the id is
      // renamed here instead. If the trailing message is an optimistic assistant
      // bubble (nanoid id, not already the server row) and the server row isn't
      // in the list yet, rename it so the merge below updates it IN PLACE rather
      // than appending the server row as a duplicate bubble.
      const sid = serverAssistantIdRef.current;
      if (sid) {
        const serverIdx = next.findIndex((x) => x.id === sid);
        const last = next[next.length - 1];
        if (
          last?.role === "assistant" &&
          last.id !== sid
        ) {
          if (serverIdx < 0) {
            // No server row in state yet — rename the bubble so the mirror
            // updates it in place instead of appending a duplicate.
            next[next.length - 1] = { ...last, id: sid };
            changed = true;
          } else if (
            serverIdx !== next.length - 1 &&
            (next[serverIdx].parts?.length ?? 0) > 0
          ) {
            // BOTH exist (mirror landed before this stream's id chunk — the
            // resume-reload race) and the server row has content: it's the
            // persisted truth; drop the trailing client bubble (2026-10-12
            // live: the same turn rendered twice — 2-part stub + 8-part row).
            // Guard on parts so we never swap a live bubble for an empty
            // placeholder.
            next.splice(next.length - 1, 1);
            changed = true;
          }
        }
      }

      // ── mirror server rows (reload-mid-generation live fill + self-heal).
      // Assistant rows update in place; a missing USER row (wiped by a draft-
      // handoff race before reconcile landed) is restored in SERVER ORDER, not
      // appended — append would put it after the reply it prompted.
      for (const m of convexMessages) {
        const ui = toChatMessage(m);
        const at = next.findIndex((x) => x.id === ui.id);
        if (at >= 0) {
          // Compare parts AND metadata: a row first mirrored while the server
          // still had status:"streaming" keeps serverStreaming:true forever if
          // metadata never refreshes — that deadlocked the composer (stuck
          // isStreaming → sends enqueued, never drained).
          if (
            JSON.stringify(next[at].parts) !== JSON.stringify(ui.parts) ||
            JSON.stringify(next[at].metadata ?? null) !==
              JSON.stringify(ui.metadata ?? null)
          ) {
            next[at] = ui;
            changed = true;
          }
        } else if (m.role === "assistant") {
          // A stopped turn's row is held back only while the server is still
          // writing it — appending mid-settle lands it below the next turn's
          // bubble. Once the row is settled (no longer server-streaming) it
          // MUST be appended like any other, or the partial the user stopped
          // is lost until a reload: the mirror already delivered and skipped
          // it, and clearing the ref on the next send does not replay it
          // (2026-10-20: stop → send → turn-1 reply vanished from the UI).
          const isSettling =
            settlingAssistantIdRef.current === ui.id &&
            (ui.metadata as { serverStreaming?: boolean } | undefined)
              ?.serverStreaming === true;
          // Never push a duplicate — the SDK bubble might already carry the
          // same id (adopted mid-stream) or the mirror might race itself.
          // Also check content: the SDK bubble might have a different id but
          // the same parts (the server row's id is different from the SDK's
          // nanoid until the adoption fires).
          const alreadyHas = next.some((x) => {
            if (x.id === ui.id) return true;
            if (x.role !== "assistant") return false;
            // Content match: same text parts = same message, regardless of id.
            const xText = x.parts.filter((p) => p.type === "text").map((p) => (p as { text?: string }).text ?? "").join("");
            const uiText = ui.parts.filter((p) => p.type === "text").map((p) => (p as { text?: string }).text ?? "").join("");
            return xText === uiText && xText.length > 0;
          });
          if (!alreadyHas) {
            if (isSettling) continue;
            next.push(ui);
            changed = true;
          }
        } else {
          // Non-assistant (user) row missing locally → reinsert at its
          // chronological slot among server rows.
          const serverIds = convexMessages.map((c) => toChatMessage(c).id);
          const serverIdx = serverIds.indexOf(ui.id);
          let insertAt = next.length;
          for (let k = serverIdx + 1; k < serverIds.length; k++) {
            const pos = next.findIndex((x) => x.id === serverIds[k]);
            if (pos >= 0) { insertAt = pos; break; }
          }
          // The scan misses when the next server row exists locally under its
          // CLIENT id (SDK bubble not yet adopted) — the row then appended
          // after the reply it prompted and the transcript inverted (user
          // bubble below the answer, 2026-10-12 live). Fall back to the first
          // assistant bubble.
          if (insertAt === next.length) {
            const firstAssistant = next.findIndex((x) => x.role === "assistant");
            if (firstAssistant >= 0) insertAt = firstAssistant;
          }
          next.splice(insertAt, 0, ui);
          changed = true;
        }
      }

      // Final guard: never leave a state with duplicate ids — the mirror's
      // user-row reinsert can double-insert when passes race, and the SDK
      // bubble and a mirrored row can share an id between the adoption rename
      // and the dedupe effect. Runs even when nothing else changed — dupes in
      // the incoming state are reason enough to write.
      const seen = new Set<string>();
      let hadDup = false;
      const deduped = next.filter((m) => {
        if (seen.has(m.id)) { hadDup = true; return false; }
        seen.add(m.id);
        return true;
      });
      if (changed || hadDup) chat.setMessages(deduped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convexMessages, chat.status, chat.setMessages, resumeInFlight, serverAssistantIdRef.current]);

  // Approval-resume dedupe (2026-09-04): the resume POST forks ids — the
  // pre-approval SDK bubble, the resume's fresh SDK bubble, and the persisted
  // server row. The server row is the COMPLETE ordered record (reasoning →
  // tool card → fresh reasoning → answer), so once it exists for the current
  // turn, drop every LOCAL-ONLY assistant bubble after the last user message.
  // (The earlier toolCall-ownership variant only dropped bubbles carrying tool
  // parts — the resume bubble had none, so duplicated thinking survived.)
  useEffect(() => {
    // Never dedupe mid-stream: the actively-streaming bubble leads and the
    // server row lags (progressive patches are throttled) — dropping there
    // kills the live reply.
    if (chat.status === "streaming" || chat.status === "submitted") return;
    // Approval-resume window: stand down only while a resume POST is in
    // flight (see the mirror effect above — a part-state check locks forever
    // after a mid-resume reload).
    if (resumeInFlight) return;
    const serverIds = new Set((convexMessages ?? []).map((m) => m.id)); // eslint-disable-line react-hooks/exhaustive-deps
    // Compute FIRST, call setMessages ONLY on a real change (2026-09-06 RCA):
    // calling setMessages unconditionally — even with an updater that returns
    // prev — notifies the chat store, the throttle mints a new messages array,
    // chat.messages changes identity, this effect refires → infinite
    // effect→setState→render loop ("Maximum update depth exceeded", thousands
    // of iterations/second in approval-resume turns).
    const prev = chat.messages;
    let lastUser = -1;
    prev.forEach((m, i) => {
      if (m.role === "user") lastUser = i;
    });
    const tail = prev.slice(lastUser + 1);
    // The server row must be present IN STATE, not just in the query
    // snapshot — dropping the SDK bubble before the mirror inserts the
    // server row leaves an empty bubble window (observed in load probes).
    const serverHasTurn = tail.some(
      (m) => m.role === "assistant" && serverIds.has(m.id),
    );
    if (!serverHasTurn) return;
    // …and the present server row must already carry the content (parts can
    // lag a progressive patch behind).
    const serverRow = tail.find(
      (m) => m.role === "assistant" && serverIds.has(m.id),
    );
    if (!serverRow || serverRow.parts.length === 0) return;
    // Dedupe by id: the SDK bubble adopts the server id mid-stream (M3), so
    // both the SDK copy and the mirrored row can carry the same id — keeping
    // both duplicated the reply (2026-10-12 live: the same answer twice).
    // First occurrence wins (the live bubble during a stream; the mirror
    // after settle — identical content either way).
    const seen = new Set<string>();
    const keep = prev.filter((m, i) => {
      // Global id dedupe — the mirror's user-row reinsert can double-insert
      // when two effect passes race (observed live: every user row twice,
      // React same-key warnings). First occurrence wins everywhere.
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      if (i <= lastUser) return true;
      if (m.role !== "assistant") return true;
      if (!serverIds.has(m.id)) return false;
      return true;
    });
    if (keep.length !== prev.length) chat.setMessages(keep);
  }, [chat.messages, chat.status, chat.setMessages, convexMessages, resumeInFlight]);

  // Dev debug handle: e2e probes read window.__chatStatus to observe the SDK
  // status machine directly (DOM indicators lag/lie about the real state).
  useEffect(() => {
    // The draft provider can stay mounted (Next keeps /chat alive for back-nav)
    // and would keep writing "ready" over the REAL provider's status, fooling
    // e2e probes. Draft writes only while /chat is actually the active route.
    if (chatId === "draft" && window.location.pathname !== "/chat") return;
    (window as unknown as Record<string, unknown>).__chatStatus = chat.status;
    // Tag with chatId: the draft provider and the real-chat provider can BOTH
    // be alive across the deferred-create navigation, and the draft's "ready"
    // then masks the real provider's status in probes (2026-09-04).
    (window as unknown as Record<string, unknown>).__chatStatusById = {
      ...((window as unknown as Record<string, Record<string, string>>).__chatStatusById ?? {}),
      [chatId]: chat.status,
    };
  }, [chat.status, chatId]);
  // Parts debug handle for e2e probes (part-type + toolCallId skeleton only).
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__chatParts = chat.messages.map(
      (m) => ({
        role: m.role,
        id: m.id,
        parts: m.parts.map((p) => ({
          t: p.type,
          s: (p as { state?: string }).state,
          c: (p as { toolCallId?: string }).toolCallId,
          len: p.type === "text" || p.type === "reasoning" ? (p as { text?: string }).text?.length : undefined,
        })),
      }),
    );
  }, [chat.messages]);

  // Live status ref for retry loops in callbacks (editAndResend): a setTimeout
  // chain closes over the chat object from creation time, so `chat.status` in
  // the closure freezes (was stuck "submitted" forever while the real status
  // went ready — the resend silently never fired, 2026-09-01 user report).
  const statusRef = useRef(chat.status);
  useEffect(() => {
    statusRef.current = chat.status;
  }, [chat.status]);

  // Sidebar "generating" blink (2026-09-04): flip the chat row on stream
  // start / off at settle. Client-side because dev runs without
  // CONVEX_DEPLOY_KEY (route-side upsertAssistant patch is the prod path).
  const setGenerating = useMutation(api.chats.setGenerating);
  useEffect(() => {
    if (isDraft || badId) return; // badId: no such row — the mutation would 500
    const u = uidRef.current;
    if (!u) return;
    const live = chat.status === "streaming" || chat.status === "submitted";
    void setGenerating({ chatId: convexChatId, userId: u, generating: live }).catch(
      () => {},
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.status, isDraft, badId, convexChatId]);

  // Edit window: while an edit→delete→resend is in flight the live-mirror must
  // NOT run — the mirror only ever adds/updates (never removes), so a row it
  // re-adds from pre-delete Convex data sticks locally and pollutes the resend
  // POST (old prompt re-sent alongside the edit, 2026-09-01).
  const editWindowRef = useRef(false);


  // (Stream-timing recorder removed 2026-09-02 — whole-run timing is gone;
  //  timing lives on the reasoning panel + per-agent rows only.)

  // ── Persist effect: dedup-by-id; user msgs immediate; assistant on ready ─
  useEffect(() => {
    if (isDraft) return;
    const u = uidRef.current;
    if (!u) return;

    // User messages: persist as soon as useChat adds them (before/during
    // streaming — fire-and-forget, parallel with the route call).
    for (const m of chat.messages) {
      if (m.role === "user" && !persistedIdsRef.current.has(m.id)) {
        persistedIdsRef.current.add(m.id);
        void messagesSend({
          chatId: convexChatId,
          userId: u,
          role: "user",
          parts: normalizeUIMessageParts(m.parts),
          id: m.id,
          model: currentModelIdRef.current,
        });
      }
    }

    // Φ10 / #3: TEXT-model assistant replies are persisted SERVER-side by the
    // route's disconnected background task (lib/ai/server-generation →
    // api.messages.upsertAssistant). Writing a second row here would dup on
    // remount, so the client only persists assistant replies for IMAGE
    // generation models — whose route branch (streamImageGeneration) streams a
    // single markdown-image text part and does NOT backgroundServe, so the server
    // never writes those rows.
    const last = chat.messages[chat.messages.length - 1];
    // Gate on CONTENT, not the CURRENT model (audit 2026-10-09): an image-gen
    // reply persisted while the image model was selected, then the user
    // switched to a text model and reloaded — isImageModel(current) was false
    // and the reply was never sanitized/persisted, so the image vanished.
    const lastIsImageGen =
      !!last &&
      last.role === "assistant" &&
      (isImageModel(currentModelIdRef.current) ||
        last.parts.some(
          (p) =>
            p.type === "text" &&
            /!\[[^\]]*\]\((?:data:image\/|https?:\/\/|blob:)/.test(
              (p as { text?: string }).text ?? "",
            ),
        ));

    if (
      lastIsImageGen &&
      !persistedIdsRef.current.has(last.id) &&
      chat.status === "ready"
    ) {
      persistedIdsRef.current.add(last.id);

      // Φ8: image-cache (the base64-loss fix). Sanitize any image markdown
      // (remote url / data: / blob:) in a text part → a `#img-${id}` placeholder
      // + collect the real URLs. Store the SANITIZED parts to Convex (no base64
      // in the row) and write {id,url} entries to IndexedDB (lib/image-cache)
      // so the render path (message.tsx) hydrates placeholders back on reload.
      const collectedImages: ImageCacheEntry[] = [];
      let touchedImages = false;
      const sanitizedParts = last.parts.map((part) => {
        if (part.type !== "text") return part;
        const text = (part as { text?: string }).text;
        if (typeof text !== "string") return part;
        const { content, images } = sanitizeMessageForStorage(text);
        if (images.length === 0) return part;
        touchedImages = true;
        collectedImages.push(...images);
        return { ...part, text: content };
      }) as typeof last.parts;

      if (touchedImages) {
        void persistImagesForMessage(last.id, collectedImages).catch(() => {
          /* cosmetic — the placeholder still renders if IndexedDB write fails */
        });
      }

      void messagesSend({
        chatId: convexChatId,
        userId: u,
        role: "assistant",
        parts: normalizeUIMessageParts(sanitizedParts),
        id: last.id,
        model: currentModelIdRef.current,
      });
      void touchChat({ chatId: convexChatId });
    }
  }, [chat.messages, chat.status, convexChatId, messagesSend, touchChat]);

  // ── Model change (local state + persist) ───────────────────────────────────
  // useCallback (perf 2026-10-10): the context value memoizes on these —
  // fresh identities would invalidate it every keystroke.
  const setCurrentModel = useCallback((id: string) => {
    setCurrentModelIdState(id);
    // The ref must move NOW, not in the effect — the draft send creates the
    // chat row from currentModelIdRef.current, and a fallback switch that
    // lands in the same tick as the send would otherwise record the OLD model
    // on the new chat row.
    currentModelIdRef.current = id;
    try {
      window.localStorage.setItem("leopard:last-model", id);
    } catch {
      /* ignore quota / private mode */
    }
    if (isDraft) return; // no row yet — the draft send persists the picked model
    const u = uidRef.current;
    if (u) void updateModel({ chatId: convexChatId, userId: u, model: id });
  }, [isDraft, convexChatId, updateModel]);

  // ── Stop: cancel a server-owned generation, then stop the local stream ─────
  // Φ10/#3 review M1 — a bare chat.stop() only aborts the browser's fetch; the
  // route's DETACHED generation keeps running (it must, so reload completes it),
  // which would make Stop appear to do nothing and the full reply reappear.
  // This also asks the server (POST /api/chat/stop) to abort + persist the
  // partial reply as `completed`, so the stopped bubble shows what it produced
  // and the server row is final.
  // Pending auto-retry timer — stop during the retry pause must cancel it,
  // else the regenerate fires anyway after the user hit stop (QA M5).
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRetryRef = useRef<() => void>(() => {});
  // Records WHY the last turn errored so the auto-retry effect can skip
  // non-retryable failures (a 403/401 dead key will never succeed on retry —
  // show the error card immediately instead of a doomed 1.5s auto-retry that
  // just fails again, which read as "working… disappears… retry fails").
  const lastErrorRef = useRef<string>("");
  const [lastErrorReason, setLastErrorReason] = useState("");
  // Transient "reconnecting / switching model" signal from the server's
  // stall→retry emission (data-retry). Cleared on the next content chunk.
  const [stallSignal, setStallSignal] = useState<{ attempt: number; maxRetries: number; delayMs: number } | null>(null);
  // Ref mirror so the memoized onData (created once) reads the live value.
  const stallSignalRef = useRef<typeof stallSignal>(null);
  // Context-compaction notice (data-compaction) — true until dismissed or the
  // next user send.
  const [compactionNotice, setCompactionNotice] = useState(false);

  const stopGeneration = useCallback((opts?: { keepStartLease?: boolean }) => {
      cancelRetryRef.current();
      // A deliberate stop ends the turn — drop the resumable re-attach marker
      // so a later mount can't try to re-attach to a generation that was just
      // aborted. (The server abort persists the partial as `completed`, so the
      // row-status gate would also block it — this is hygiene, not correctness.)
      clearPendingStreamId(chatId);
      // Only ask the server to abort when we know the detached generation's id
      // (image-gen has no server row, so local stop alone suffices). RETURNED
      // so editMessage can order: stop → (abort's partial persist lands) →
      // delete rows → resend. Fire-and-forget here raced the delete and the
      // abort's finalize upsert resurrected the old assistant row (2026-09-01).
      const sid = serverAssistantIdRef.current;
      settlingAssistantIdRef.current = sid;
      // After a mid-stream reload the assistantId ref is empty (it's only set
      // from the live data-assistant-id chunk) — but the server-side detached
      // generation is still running and the mirror keeps syncing it into the
      // UI. Fall back to chatId so stop halts the server generation too
      // (X1.1: reload → stop kept growing 1393 chars in 5s).
      const stopped =
        sid != null || !isDraft
          ? fetch("/api/chat/stop", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(sid != null ? { assistantId: sid, chatId } : { chatId }),
            }).catch(() => {
              /* server already settled — local stop still ends the mirror */
            })
          : Promise.resolve();
      // Serverless gap: /api/chat/stop can land on an instance that doesn't
      // hold the abort registry — the generation keeps writing and the row
      // stays "streaming", leaving the composer stuck on stop (2026-09-05).
      // DEFERRED 5s (P02-GEN-005): settling instantly raced the server's own
      // abort-finalize — the mirror swapped the full live bubble for the
      // shorter last-persisted partial and text visibly SHRANK after stop.
      // Now the server's finalize wins; settle only fires if the row is STILL
      // streaming after the grace window (dead/missed stop).
      if (uid) {
        const userId = uid;
        setTimeout(() => {
          const staleRow = [...(convexMessagesRef.current ?? [])]
            .reverse()
            .find((m) => m.role === "assistant" && m.status === "streaming");
          if (staleRow) {
            void settleStreaming({
              messageId: staleRow._id,
              userId,
            }).catch(() => {});
          }
        }, 5000);
      }
      chat.stop();
      // Kill turns the user queued behind this one — they were sent while a
      // turn was already running, and the user has now said stop. The live
      // turn is left to settle (stopRun semantics: abort the fetch, let the
      // server's finalize persist the partial).
      turnQueueRef.current.drop();
      if (!opts?.keepStartLease) startLeases.current.invalidate();
      return stopped;
    },
    [chat.stop, chatId, isDraft, uid, settleStreaming],
  );

  // Settle-aware wait (audit 2026-10-09, deep-sweep #4): edit/regen used to
  // sleep a fixed 400ms after /stop, but the route's abort-finalize upsert can
  // land LATER than that — the mirror then resurrected the aborted row under
  // the resent turn. Poll the rows until no assistant row is still streaming
  // (or 5s cap, matching the settleStreaming grace), THEN delete.
  const waitForStreamingSettle = useCallback(async () => {
    for (let i = 0; i < 25; i++) {
      const stale = (convexMessagesRef.current ?? []).some(
        (m) => m.role === "assistant" && m.status === "streaming",
      );
      if (!stale) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    // Cap hit: proceed anyway — the settled-by-settleStreaming fallback in
    // stopGeneration (5s) will land about now; a longer wait risks the user
    // perceiving a frozen edit/regen.
  }, []);

  // ── Hung-request watchdog (X3.2): a POST that never answers (proxy swallow,
  // dead upstream before first byte) leaves the SDK stuck in "submitted"/
  // "streaming" forever — spinner with no way back short of reload. The server
  // has its own stall watchdog for streams it OWNS; this covers the case where
  // no response ever reaches the client. If status stays non-ready AND no
  // message content changes for 150s, abort: stopGeneration returns the UI to
  // "ready" (and halts any detached server generation via the chatId fallback).
  // 150s, not 75s: the server's own stall→fallback chain needs 45s (stall-open)
  // + 2.5s backoff + up to ~90s for a slow fallback model (nemotron thinking-on
  // took 18–34s in the 2026-10-07 window; big models slower) — 75s killed a
  // healthy fallback mid-flight and showed "Stopped" over a still-working turn.
  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, [chat.messages, chat.status]);
  // Approval-pending detection (shared by the watchdog + the 90s reaper, both
  // below). Hoisted above the watchdog (2026-10-10 Z1) — it used to live with
  // the reaper, so the 150s watchdog never got the carve-out and killed a
  // pending decision mid-read. A held approval is LEGITIMATELY silent (the SDK
  // stream ended on the approval gate; the server holds the turn open until
  // the user decides, up to the 10-min ceiling). True when any streaming
  // assistant row still holds an approval-requested part.
  const approvalPendingOnStreamingRow = (convexMessages ?? []).some(
    (m) =>
      m.role === "assistant" &&
      m.status === "streaming" &&
      (m.parts ?? []).some((p) => isPendingApprovalPart(p)),
  );

  // The pending approval straight from the server row — covers the case where
  // the SDK stream already ended on the gate (status ready, bubble settled)
  // while the server still holds the turn for the decision.
  const pendingServerApproval = (() => {
    for (let i = (convexMessages ?? []).length - 1; i >= 0; i--) {
      const m = convexMessages![i];
      if (m.role !== "assistant") break;
      if (m.status !== "streaming") break;
      for (const p of (m.parts ?? []) as Array<Record<string, unknown>>) {
        const t = typeof p.type === "string" ? p.type : "";
        const isTool = t === "tool" || (t.startsWith("tool-") && t !== "tool-approval-request" && t !== "tool-approval-response");
        if (isTool && p.state === "approval-requested") {
          const approval = p.approval as { id?: string } | undefined;
          if (!approval?.id) continue;
          const toolName =
            (p.toolName as string) ??
            (t.startsWith("tool-") && t !== "tool" ? t.slice(5) : undefined) ??
            "tool";
          return { approvalId: approval.id, toolName, input: p.input };
        }
      }
    }
    return null;
  })();

  // ── Resumable-stream re-attach on remount (reload mid-generation) ──────────
  // A sessionStorage marker (written by the transport wrapper from the route's
  // x-resumable-stream-id header) plus a still-"streaming" trailing server row
  // means the detached generation is live on the server → re-attach to its SSE
  // with chat.resumeStream() (GET /api/chat/[chatId]/stream). The replayed
  // stream rebuilds the trailing bubble IN PLACE: the GET route patches the
  // replayed start chunk's messageId to the persisted row id, and the SDK's
  // resume processing replaces an existing message by id on every write. No
  // mirror interference — the mirror stands down while status is
  // streaming/submitted and reconciles the final Convex row at settle.
  // Guards:
  //   - resumedStreamIdsRef: ONE attempt per (chatId, streamId) — never
  //     double-resume (StrictMode double-invoke, convexMessages refetches,
  //     status flapping back to ready).
  //   - status gate: only from "ready" — a live local stream or an errored
  //     turn is left alone.
  //   - the marker is consumed on attempt (cleared), so a stale marker can
  //     never re-arm a later mount.
  //   - approval-held rows are SKIPPED (the replay log drops
  //     tool-approval-request chunks by design; the mirror owns those turns).
  //   - seed-carrying rows are SKIPPED (approval-resume generations): the
  //     replay's start-reset rebuilds the bubble without the seeded tool
  //     cards until the mirror restores them at settle.
  // Fallback contract: a 204 (generation settled, or another server instance
  // owns it) flips the SDK straight back to ready and the Convex mirror keeps
  // doing exactly what it always did. This path only ever ADDS a faster
  // re-attach on top of that fallback — never replaces it.
  const resumedStreamIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isDraft || badId) return;
    if (!convexMessages) return;
    if (chat.status !== "ready") return;
    const streamId = readPendingStreamId(chatId);
    if (!streamId) return;
    const guardKey = `${chatId}:${streamId}`;
    if (resumedStreamIdsRef.current.has(guardKey)) return;
    const lastServer = convexMessages[convexMessages.length - 1];
    if (
      !lastServer ||
      lastServer.role !== "assistant" ||
      lastServer.status !== "streaming"
    ) {
      // Stale marker — the turn already settled server-side while the tab was
      // closed. Nothing to re-attach to.
      clearPendingStreamId(chatId);
      return;
    }
    if (approvalPendingOnStreamingRow) return;
    const seedCarried = (lastServer.parts ?? []).some((p) => {
      const s = (p as { state?: string }).state;
      return s === "approval-responded" || s === "output-denied";
    });
    if (seedCarried) return;
    resumedStreamIdsRef.current.add(guardKey);
    clearPendingStreamId(chatId);
    console.log("[chat] resumable re-attach:", guardKey);
    void chat.resumeStream().catch(() => {
      /* surfaced via chat.error → onError → error card; the mirror heals */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gates read the
    // latest convexMessages snapshot; chat.resumeStream is instance-stable.
  }, [convexMessages, chat.status, chatId, isDraft, badId, approvalPendingOnStreamingRow]);

  useEffect(() => {
    // Cover serverStreaming (reopened mid-generation, SDK status is "ready")
    // — a mirrored stream that goes silent must also be recoverable, else the
    // composer locks in the stop state until the 90s reaper (audit 2026-10-06).
    const live =
      chat.status === "streaming" || chat.status === "submitted" || serverStreaming;
    if (!live) return;
    // Approval-pause carve-out (2026-10-10): a held approval is LEGITIMATELY
    // silent — the watchdog used to kill it at 150s mid-decision and bury the
    // Allow/Deny card the user was reading. A pending decision is not a hang.
    if (approvalPendingOnStreamingRow) return;
    // 240s (was 150s) — Z5 (2026-10-10): the server idle ceiling is 300s
    // idle-based, so a client that kills at 150s aborts a healthy long-silent
    // phase (a slow tool exec, a multi-agent stretch) on a mirrored turn. The
    // client now outlasts the stall chain (45s stall-open + backoff + a slow
    // fallback ≈ 137s) and the approval ceiling is the backstop for a held
    // decision; a truly dead upstream settles server-side first. The 90s
    // reaper still covers the settled-row case.
    const t = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 240_000) {
        console.warn("[chat] hung request — no activity for 240s, aborting");
        stopGeneration();
      }
    }, 5_000);
    return () => clearInterval(t);
  }, [chat.status, stopGeneration, approvalPendingOnStreamingRow]);

  // ── Reasoning change (local state + localStorage) ──────────────────────────
  // useCallback (perf 2026-10-10): see setCurrentModel.
  const setReasoning = useCallback(
    (level: ReasoningLevel) => {
      setCurrentReasoning(level);
      try {
        // Per-chat key for real chats; the model-level key only moves from the
        // draft screen (it's the default for not-yet-seen chats).
        window.localStorage.setItem(reasoningKey(currentModelId, chatId), level);
      } catch {
        /* ignore quota / private mode */
      }
    },
    [currentModelId, chatId, reasoningKey],
  );

  // ── Deferred-create: draft send mints the row, then routes ─────────────────
  // /chat mounts this provider with chatId="draft" and NO Convex row (kills the
  // empty-chat-on-every-open bug). First send: create the row, stash the parts
  // in sessionStorage, router.replace to /chat/<id>; the remounted provider
  // below picks the stash up and fires the REAL send through the normal path
  // (persistence, server title, live-mirror all behave as usual).
  const sendMessage = useCallback<ActiveChatContextValue["sendMessage"]>(
    (message, options) => {
      // A new turn supersedes the compaction notice from the previous one.
      setCompactionNotice(false);
      // Orphan-approval cleanup (leopard B4): a new send while an approval card is
      // still pending leaves the card hanging forever — mark every
      // approval-requested part as cancelled so the card settles as skipped.
      const hasPending = chat.messages.some(
        (m) =>
          m.role === "assistant" &&
          (m.parts ?? []).some((p) => isPendingApprovalPart(p)),
      );
      if (hasPending) {
        chat.setMessages(
          chat.messages.map((m) =>
            m.role !== "assistant"
              ? m
              : {
                  ...m,
                  parts: (m.parts ?? []).map((p) =>
                    isPendingApprovalPart(p)
                      ? ({ ...p, state: "output-denied", approval: { ...(p as { approval?: object }).approval, approved: false, reason: "Superseded by a new message" } } as typeof p)
                      : p,
                  ),
                },
          ),
        );
      }
      if (!isDraft) {
        settlingAssistantIdRef.current = null;
        startLeases.current.invalidate();
        return turnQueueRef.current
          .enqueue(() => chat.sendMessage(message, options))
          .catch((error) => {
            // A dropped follower (stopGeneration landed first) is not an error
            // the user needs a card for — the turn they stopped is gone.
            if (error instanceof SerialRunQueueDropError) return undefined;
            throw error;
          }) as ReturnType<typeof chat.sendMessage>;
      }

      const u = uidRef.current;
      if (!u) return Promise.resolve(undefined as never);
      const parts =
        message && typeof message === "object" && "parts" in message
          ? (message.parts as PendingPart[])
          : [{ type: "text", text: String((message as { text?: string })?.text ?? "") }];
      return (async () => {
        // Draft-handoff dead window (audit 2026-10-06): show the user's bubble
        // + thinking on the DRAFT screen the instant they hit Enter, before the
        // createChat round-trip + route swap. This is display-only (the draft
        // provider never sends) — the real send happens on the target chat via
        // the stash. A sendMessage on the draft would POST with no chat id.
        chat.setMessages([
          { id: "draft-pending", role: "user", parts: parts as never } as never,
        ]);
        try {
          const id = await createChat({
            userId: u,
            title: "New Chat",
            model: currentModelIdRef.current,
          });
          stashPendingMessage(id, parts, currentModelIdRef.current);
          router.replace(`/chat/${id}`);
        } catch (e) {
          // createChat failed (offline / Convex error): the optimistic bubble
          // would otherwise sit forever with no chat, no stream, no error card
          // (the SDK error path never engages — no POST ever fires). Roll the
          // bubble back, return the text to the composer, and say why (audit
          // 2026-10-08 — silent message loss).
          chat.setMessages([]);
          const text = parts
            .filter((p): p is PendingPart & { type: "text" } => (p as { type?: string }).type === "text")
            .map((p) => p.text)
            .join("\n");
          if (text) window.dispatchEvent(new CustomEvent("composer:set-text", { detail: { text } }));
          toast.error("Couldn't start the chat — check your connection and send again. Your message is back in the box.");
          console.error("[draft-send] createChat failed", e);
        }
        return undefined as never;
      })();
    },
    [isDraft, chat.sendMessage, createChat, router],
  );

  // ── Pending-message pickup: a fresh /chat/<id> created from a draft sends
  // the stashed first message once (refs reset per chatId key — safe).
  const pendingSentRef = useRef(false);
  useEffect(() => {
    if (isDraft || pendingSentRef.current) return;
    const pending = takePendingMessage(chatId);
    if (!pending || pending.parts.length === 0) return;
    pendingSentRef.current = true;
    // Draft-handoff dead window (audit 2026-10-06): the user watched their text
    // clear on /chat, then a full-screen "Loading chat" loader, THEN the bubble
    // — two "did it eat my message?" windows. The SDK's sendMessage below adds
    // the optimistic user bubble itself; the loader suppression (hasPendingDraft
    // in isLoading) is what kills the dead window. Do NOT also setMessages here —
    // that double-rendered the bubble (two identical user rows, 2026-10-06).
    // Honor the model picked on the draft screen: apply it to state + the ref
    // BEFORE the send, otherwise the turn fires with the default model.
    if (pending.model && pending.model !== currentModelIdRef.current) {
      currentModelIdRef.current = pending.model;
      setCurrentModelIdState(pending.model);
      hasSyncedModelRef.current = true; // don't let the chatMeta sync override it
    }
    // Defer to the next tick — the OLD chat instance (draft) unmounts on the
    // route change and its useChat cleanup calls stop(), which aborts any
    // in-flight fetch. If the pickup fires in the same tick, the abort lands
    // on the NEW send (AbortError: signal is aborted without reason).
    setTimeout(() => {
      void chat.sendMessage({ parts: pending.parts } as never);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot per mount
  }, [isDraft, chatId]);

  // ── Regenerate with server-row cleanup ────────────────────────────────────
  // chat.regenerate drops the old assistant bubble from SDK state, but the
  // SERVER-persisted row stays in Convex — the live-mirror effect then appends
  // it next to the new reply (the "old answer reappears" bug). Delete every
  // persisted message at-or-after the target's createdAt first, then regen.
  const regenerateMessage = useCallback(
    (messageId: string) => {
      // Record the outgoing reply as a sibling of its replacement BEFORE the
      // SDK drops it — keyed by the preceding user message id (see above).
      const idx = chat.messages.findIndex((m) => m.id === messageId);
      const outgoing = idx >= 0 ? chat.messages[idx] : undefined;
      if (outgoing?.role === "assistant") {
        const text = outgoing.parts
          .filter((p) => p.type === "text")
          .map((p) => (p as { text: string }).text)
          .join("");
        for (let i = idx - 1; i >= 0; i--) {
          if (chat.messages[i].role === "user") {
            const uid2 = chat.messages[i].id;
            if (text.trim()) {
              setSiblings((s) => ({ ...s, [uid2]: [...(s[uid2] ?? []), text] }));
            }
            break;
          }
        }
      }
      // Same ordering as editAndResend: abort the detached generation first and
      // let its finalize-partial write land BEFORE deleting rows, else the
      // abort's upsert resurrects the old assistant row after the delete.
      const stopped = stopGeneration({ keepStartLease: true });
      const u = uidRef.current;
      const target =
        !isDraft && u && convexMessages
          ? convexMessages.find((m) => m.id === messageId)
          : undefined;
      const cleanup = target
        ? stopped
            .then(() => waitForStreamingSettle())
            .then(() =>
              deleteAfterTimestamp({
                chatId: convexChatId,
                timestamp: target.createdAt,
                userId: u!,
              }),
            )
            .catch(() => {
              /* cosmetic — worst case the mirror re-adds the stale row */
            })
        : stopped;
      const r = (
        chat as unknown as {
          regenerate?: (opts?: { messageId?: string }) => void;
        }
      ).regenerate;
      if (typeof r !== "function") return;
      // The id can be stale (server-id adoption after a settle) — regenerating
      // with an unknown id throws "message not found" and the SDK falls back to
      // re-sending the last user message, DUPLICATING the turn. Fall back to a
      // bare regenerate (last assistant reply) when the id isn't live.
      const known = chat.messages.some((m) => m.id === messageId);
      const lease = startLeases.current.begin();
      void cleanup.then(() => {
        if (!lease.isCurrent()) return; // superseded during cleanup — withhold
        try {
          if (known) void r({ messageId });
          else void r();
        } catch {
          try {
            void r();
          } catch {
            toast.error("Couldn't regenerate");
          }
        }
      });
    },
    [isDraft, convexMessages, convexChatId, deleteAfterTimestamp, chat, stopGeneration, waitForStreamingSettle],
  );

  // ── Edit (user message) with server-row cleanup ───────────────────────────
  // Same resurrection trap as regen: truncating only SDK state leaves the
  // Convex rows intact, and the live-mirror heal re-inserts them — the user
  // saw their message TWICE (old server row + edited resend). Delete every
  // persisted row at-or-after the target first, then truncate local state.
  const editMessage = useCallback(
    (messageId: string) => {
      // Stop any in-flight stream FIRST — truncating the message list out from
      const stopped = stopGeneration({ keepStartLease: true });
      editWindowRef.current = true; // mirror off until the resend fires
      const u = uidRef.current;
      let deleted: Promise<unknown> = Promise.resolve();
      if (!isDraft && u && convexMessages) {
        const target = convexMessages.find((m) => m.id === messageId);
        if (target) {
          // AWAITED by editAndResend: truncating local state before the server
          // rows are gone lets the live-mirror re-add them (mirror never
          // removes), and a resend fired in that window re-POSTs the old rows
          // — the route then re-persists them (duplicate bubbles, 2026-09-01).
          // Also: the abort's finalize-partial write lands just AFTER /stop
          // responds — deleting before it lets that upsert resurrect the old
          // assistant row. Stop, wait until no row is still streaming (5s cap),
          // THEN delete (settle-aware — fixed 400ms raced, audit 2026-10-09).
          deleted = stopped
            .then(() => waitForStreamingSettle())
            .then(() =>
              deleteAfterTimestamp({
                chatId: convexChatId,
                timestamp: target.createdAt,
                userId: u,
              }),
            )
            .catch(() => {
              /* worst case the mirror briefly re-adds the stale row */
            });
        }
      }
      chat.setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        return idx >= 0 ? prev.slice(0, idx) : prev;
      });
      return deleted;
    },
    [isDraft, convexMessages, convexChatId, deleteAfterTimestamp, chat, stopGeneration, waitForStreamingSettle],
  );

  // Edit → auto-resend (operator 2026-09-01: "save and proceed" that doesn't
  // resend is broken UX). editMessage stops any live stream + truncates; the
  // status can lag a tick, so poll the send gate briefly before firing.
  const editAndResend = useCallback(
    (messageId: string, text: string) => {
      // Await the server-side row delete: the live-mirror re-adds any row still
      // present in Convex (it never removes), so truncating local state while
      // the delete is in flight lets the old rows bounce back — and a resend
      // fired in that window re-POSTs them (route re-persists → duplicates).
      // The await also gives React a full network round-trip to apply the
      // setMessages truncation before we send.
      const lease = startLeases.current.begin();
      void Promise.resolve(editMessage(messageId)).then(() => {
        let tries = 0;
        const attempt = () => {
          if (!lease.isCurrent()) {
            editWindowRef.current = false;
            return;
          }
          // statusRef, NOT chat.status: this closure is from callback-creation
          // time; the SDK status inside it never advances.
          const st = statusRef.current;
          if (st === "streaming" || st === "submitted") {
            if (++tries < 50) setTimeout(attempt, 100);
            else {
              // Give-up path (audit 2026-10-08): the edit already truncated the
              // thread — silently returning loses the user's replacement text
              // with zero signal. Put the text back in the composer and say so.
              editWindowRef.current = false; // mirror back on
              window.dispatchEvent(new CustomEvent("composer:set-text", { detail: { text } }));
              toast.error("Couldn't resend — the current reply wouldn't stop. Your edited text is back in the box.");
            }
            return;
          }
          void sendMessage({ text });
          editWindowRef.current = false;
        };
        setTimeout(attempt, 0);
      });
    },
    [editMessage, sendMessage],
  );

  // Approval answer + resume, PROVIDER-side (2026-09-04): the ApprovalDock
  // unmounts the instant the part flips to approval-responded, killing any
  // dock-local poll/timer before the resume POST fires — the turn died
  // silently on fast approvals. Here the poll lives as long as the chat.
  // Status read via statusRef (closure statuses freeze); sendMessage is a
  // stable Chat-instance method.
  // True from the Allow/Deny click until the resume stream settles. The mirror
  // + dedupe stand down only in this window; a persisted approval-responded
  // row after a reload must NOT block them (X4.2).
  const approveAndResume = useCallback(
    (approvalId: string, approved: boolean, reason?: string) => {
      // Mirror-row gate: the SDK stream already ended on the gate, so the SDK
      // holds no tool part for addToolApprovalResponse to answer. Write the
      // decision to the ROW so the resume POST carries it and the server's
      // resolver can anchor. Fire-and-forget: the resume POST below re-reads
      // the row server-side, and a lost write only means the pre-fix failure.
      // Set FIRST: the mutation's Convex write re-fires the mirror effect, and
      // without the flag it would clobber the SDK's approval-responded patch
      // below before the resume POST reads it.
      setResumeInFlight(true);
      if (!isDraft && convexChatId && uidRef.current) {
        void respondToApproval({
          chatId: convexChatId as never,
          userId: uidRef.current,
          approvalId,
          approved,
          ...(reason !== undefined ? { reason } : {}),
        }).catch(() => {
          /* the resume POST's own anchor poll is the backstop */
        });
      }
      (
        chat as unknown as {
          addToolApprovalResponse?: (r: { id: string; approved: boolean; reason?: string }) => void;
        }
      ).addToolApprovalResponse?.({ id: approvalId, approved, ...(reason !== undefined ? { reason } : {}) });
      // The SDK responder no-ops when the gated part isn't approval-requested
      // in its LAST message (e.g. the SDK stream ended on a LATER retry's gate
      // and the mirror's row is what renders). Patch the decision into whatever
      // assistant message carries the part so the resume wire always has it.
      {
        const msgs = chat.messages;
        const marked = msgs.some((m) =>
          m.role === "assistant" &&
          (m.parts ?? []).some(
            (p) =>
              (p as { state?: string }).state === "approval-responded" &&
              (p as { approval?: { id?: string } }).approval?.id === approvalId,
          ),
        );
        if (!marked) {
          chat.setMessages(
            msgs.map((m) =>
              m.role !== "assistant"
                ? m
                : {
                    ...m,
                    parts: (m.parts ?? []).map((p) => {
                      const rec = p as { state?: string; approval?: { id?: string } };
                      return rec.state === "approval-requested" && rec.approval?.id === approvalId
                        ? ({ ...p, state: "approval-responded", approval: { ...rec.approval, approved, ...(reason !== undefined ? { reason } : {}) } } as typeof p)
                        : p;
                    }),
                  },
            ),
          );
        }
      }
      // Approval-gate hold (2026-10-10): the SDK stream ENDS on an unresolved
      // approval and the SERVER holds the turn open — the SSE stays open until
      // the resume POST's abortAndSettle aborts it. Cancel the CLIENT-side
      // request only (SDK stop, NOT the /api/chat/stop POST — that would abort
      // the server gen + settle the row before the resume's seed poll could
      // anchor). Don't poll statusRef: chat.stop() aborts the fetch but the
      // status flip is async (React render + useEffect). The old 120×150ms poll
      // exhausted without the ref ever reading "ready" on a held stream →
      // resume never fired → zombie turn (live repro 2026-10-12: createDocument
      // allow → 18min Thinking → document created server-side but client
      // stuck). Wait two frames (stop → SDK state → React render → ref sync),
      // then force-send. If the SDK is somehow still streaming, sendMessage
      // queues or the route's resume detection handles it.
      chat.stop();
      // Generation fence: any newer begin() invalidates this lease, so the
      // release poll and the mirror gate stay open even if a stale RAF poll
      // from an aborted resume window fires.
      const lease = resumeLeases.current.begin();
      // Two ticks: first lets the abort propagate through the SDK's internal
      // stream processing, second lets React flush the status update.
      // setTimeout, NOT requestAnimationFrame: RAF is suspended whenever the
      // compositor is not painting (hidden/backgrounded tab, headless), which
      // left the resume POST permanently unsent and the turn dead. A timer
      // fires in every visibility state.
      const tick = (cb: () => void) => setTimeout(cb, 32);
      tick(() => {
        tick(() => {
          if (!lease.isCurrent()) return;
          void resumeLeases.current
            .fenced(() => chat.sendMessage())
            .catch(() => {
              /* surfaced via chat.error → error card */
            });
          // Release once the resume stream drains back to ready. Two phases:
          // the 250ms poll used to catch the stale "ready" between sendMessage
          // and the status actually flipping — released instantly, the mirror
          // ran mid-resume and the dedupe collapsed nothing (s3 allow: 2
          // bubbles, 2026-09-06). Wait until the stream is OBSERVED live first
          // (15s cap: a denied-only resume may never stream), then until ready.
          let sawLive = false;
          const t0 = Date.now();
          const release = () => {
            // A superseded lease must still clear the flag: the mirror gate
            // re-checks the lease itself, so releasing here cannot let a stale
            // resume mirror — it only stops a dead poll from stranding the flag.
            if (!lease.isCurrent()) {
              setResumeInFlight(false);
              return;
            }
            const s = statusRef.current;
            if (s === "streaming" || s === "submitted") {
              sawLive = true;
              setTimeout(release, 250);
              return;
            }
            if (!sawLive && Date.now() - t0 < 15_000) {
              setTimeout(release, 250);
              return;
            }
            setResumeInFlight(false);
          };
          setTimeout(release, 250);
        });
      });
    },
    [chat, respondToApproval, isDraft, convexChatId],
  );

  // Prior reply variants for the turn an assistant message answers (empty when
  // the message was never regenerated this session).
  const getSiblings = useCallback(
    (messageId: string): string[] => {
      const idx = chat.messages.findIndex((m) => m.id === messageId);
      if (idx < 0) return [];
      for (let i = idx - 1; i >= 0; i--) {
        if (chat.messages[i].role === "user") {
          return siblings[chat.messages[i].id] ?? [];
        }
      }
      return [];
    },
    [chat.messages, siblings],
  );
  // A pending draft stash means the user just sent their first message — the
  // optimistic bubble renders from the stash, so DON'T flash the full-screen
  // "Loading chat" loader while Convex resolves (dead window, audit 2026-10-06).
  // Read sessionStorage once (cheap, synchronous); only consulted pre-mount.
  const hasPendingDraft = useRef(
    !isDraft && typeof window !== "undefined" && hasPendingMessage(chatId),
  ).current;
  const isLoading = isDraft
    ? false
    : badId
      ? false // malformed id → not-found UI, never a loader
      : hasPendingDraft
        ? false // pending stash → optimistic bubble, no loader flash
        : chatMeta === undefined || convexMessages === undefined;
  // No local stream, but the newest assistant row is still server-written →
  // the user reopened mid-generation and Convex is live-patching the bubble.
  const lastMsg = chat.messages[chat.messages.length - 1];
  const serverStreaming =
    chat.status !== "streaming" &&
    chat.status !== "submitted" &&
    lastMsg?.role === "assistant" &&
    (lastMsg.metadata as { serverStreaming?: boolean } | undefined)
      ?.serverStreaming === true;

  // Stuck-stop reaper (2026-09-05): a detached generation that dies without
  // its final patch (lambda recycled, route restart, or a stop POST that
  // landed on a DIFFERENT serverless instance than the one holding the abort
  // registry) leaves its row status:"streaming" forever — serverStreaming
  // never clears and the composer locks in the stop state with clicks that do
  // nothing. Message rows carry no updatedAt, so progress = convexMessages
  // changing at all (every progressive patch refires this effect and resets
  // the timer). 90s of silence → settle the row server-side; every client
  // recovers on the next mirror.
  // Approval-pause carve-out (2026-10-10): an approval-gated generation is
  // LEGITIMATELY silent — the SDK stream is paused awaiting the user's
  // Allow/Deny, so no chunks → no progressive patches → the reaper read the
  // pause as a dead generation, settled the row at 90s, buried the card, and
  // the turn went zombie ("Working" forever, LLM never called — live repro:
  // the Instagram-CDN webFetch chat). While the trailing assistant row holds
  // an approval-requested part, the reaper stands down; the SERVER's
  // approval ceiling (10 min) is the abandonment backstop instead.
  // (approvalPendingOnStreamingRow is hoisted above the 150s watchdog — Z1.)
  const lastStreamingRow = serverStreaming
    ? [...(convexMessages ?? [])]
        .reverse()
        .find((m) => m.role === "assistant" && m.status === "streaming")
    : undefined;
  useEffect(() => {
    if (!lastStreamingRow || !uid) return;
    if (approvalPendingOnStreamingRow) return; // user is deciding — not stuck
    const t = setTimeout(() => {
      void settleStreaming({
        messageId: lastStreamingRow._id,
        userId: uid,
      }).catch(() => {
        /* transient — the next mirror pass retries */
      });
    }, 90_000);
    return () => clearTimeout(t);
  }, [lastStreamingRow, uid, settleStreaming, approvalPendingOnStreamingRow]);
  // Auto-retry once on a failed run before surfacing the error card (QA M5 —
  // lifted out of Messages so the composer can flip to the stop state during
  // the retry window). Keyed per trailing message id: a new turn gets its own
  // free retry; StrictMode double-invoke is guarded by the ref.
  const [retrying, setRetrying] = useState(false);
  const autoRetriedRef = useRef<string | null>(null);
  cancelRetryRef.current = () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setRetrying(false);
  };
  // Deps are PRIMITIVES (status + stable keys): chat.messages is a new array
  // identity almost every render, and re-running this effect cleared the 1.5s
  // timer before it fired — retrying stuck true, no retry, no error card.
  const lastMsgForRetry = chat.messages[chat.messages.length - 1];
  const lastUserIdForRetry = [...chat.messages].reverse().find((m) => m.role === "user")?.id;
  useEffect(() => {
    if (chat.status !== "error") return;
    const last = lastMsgForRetry;
    // QA M1: never auto-regenerate a turn whose reply already streamed content —
    // regen deletes the good persisted row and a fresh generation can answer
    // differently (observed: "Ultraviolet." → "Unknown" after reload). A partial
    // turn shows the manual error card instead of being silently replaced.
    const hasContent =
      last?.role === "assistant" &&
      (last.parts ?? []).some(
        (p) =>
          (p.type === "text" &&
            typeof (p as { text?: unknown }).text === "string" &&
            (p as { text: string }).text.trim().length > 0) ||
          (typeof p.type === "string" &&
            p.type.startsWith("tool-") &&
            (p as { state?: string }).state === "output-available"),
      );
    if (hasContent) return;
    // GAP G (2026-10-10): a network blip mid-approval flips the SDK stream to
    // "error" while the SERVER still holds the turn open for the user's
    // decision (the row stays streaming with approval-requested). Auto-retrying
    // here regenerates the turn from scratch — aborting the hold and replaying
    // the whole thing under the user. The card must stay up for them to
    // decide; don't retry. The 10-min server ceiling is the abandonment
    // backstop; the error surface resolves on the next real interaction.
    if (approvalPendingOnStreamingRow) return;
    // Key on the last USER message id, not the assistant row: regenerate
    // mints a fresh assistant id each attempt, which made the guard re-arm on
    // every failure → infinite retry loop and the error card never showed.
    // Skip auto-retry for non-retryable failures — a 403/401 (dead/expired
    // key), a 404 (model removed), or a 400 (bad request) will fail identically
    // on retry. Show the error card immediately instead of a doomed retry loop.
    // Route-gate failures carry no status digits in the thrown message (the
    // SDK throws the JSON body, e.g. '{"error":"unauthorized"}'), so match the
    // route's literal error codes too — otherwise a 401/400 auto-retries into
    // the same deterministic wall (audit 2026-10-06).
    const fatal =
      /\b(401|403|404)\b|Authorization failed|Forbidden|API key|not configured|Bad Request|unauthorized|model_not_allowed|bad_request|daily_token_cap|not enabled|Tool results? (are|is) missing|MissingToolResults/i.test(
        lastErrorRef.current,
      );
    if (fatal) return;
    const key = lastUserIdForRetry ?? last?.id ?? "empty";
    if (autoRetriedRef.current === key) return;
    autoRetriedRef.current = key;
    setRetrying(true);
    const t = setTimeout(() => {
      retryTimeoutRef.current = null;
      setRetrying(false);
      if (last) regenerateMessage(last.id);
    }, 1500);
    retryTimeoutRef.current = t;
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.status, lastMsgForRetry?.id, lastUserIdForRetry]);

  // Clear the stall chip once the stream resolves (ready/error) — the retry
  // either succeeded (content flows, cleared in onData) or errored out.
  useEffect(() => {
    if (chat.status === "ready" || chat.status === "error") {
      stallSignalRef.current = null;
      setStallSignal(null);
      // Stale artifact settle (audit 2026-10-09): a stop/reload before
      // data-finish left artifact.status "streaming" forever — the panel spun
      // "generating…" on a dead turn. Chat settled ⇒ the artifact is done.
      setArtifactState((a) =>
        a && a.status === "streaming" ? { ...a, status: "idle" } : a,
      );
      // Stale approval purge (audit 2026-10-09): a settled turn whose trailing
      // assistant row still carries approval-requested parts resurrects the
      // Allow/Deny dock on every reload (observed live: the 3× webFetch chat
      // showed the card after completion). Turn over ⇒ the prompt is dead;
      // flip the parts to a terminal state so the dock stays buried.
      // Approval-gate carve-out (2026-10-10): the SDK stream ENDS (finishReason
      // "tool-calls") while the SERVER holds the turn open awaiting the user's
      // decision — the approval-gate hold path keeps the row status:"streaming".
      // Purging in that window killed the Allow/Deny card before the user could
      // click (the exact "it automatically stops before I allow/deny" bug).
      // The purge only runs once the persisted row has settled (completed) —
      // i.e. the server gave up too (ceiling / stop / real completion).
      const last = chat.messages[chat.messages.length - 1];
      const rowStillStreaming = (convexMessages ?? []).some(
        (m) =>
          (m.id === last?.id || m.id === serverAssistantIdRef.current) &&
          m.status === "streaming",
      );
      if (last?.role === "assistant" && !rowStillStreaming) {
        const stale = (last.parts ?? []).some((p) => isPendingApprovalPart(p));
        if (stale) {
          // Flip to a terminal non-resume state (NOT approval-responded — that
          // would make the NEXT send read as a resume to hasApprovalDecision).
          // "interrupted" maps through mapToolState → "unknown" → the neutral
          // interrupted chip (not a red error card) in the transcript; the
          // dock's scan requires "approval-requested" → card stays buried.
          chat.setMessages((prev) =>
            prev.map((m) =>
              m.id !== last.id
                ? m
                : {
                    ...m,
                    parts: (m.parts ?? []).map((p) =>
                      isPendingApprovalPart(p)
                        ? { ...(p as object), state: "interrupted" }
                        : p,
                    ) as never,
                  },
            ) as never,
          );
        }
      }
    }
  }, [chat.status, convexMessages]);

  // Memoized context value (perf 2026-10-10): without useMemo every provider
  // re-render handed subscribers a fresh object — a composer keystroke
  // re-rendered the whole chat tree. chat spreads (its identity changes with
  // the SDK stream anyway); the action fns are useCallback'd above.
  const value: ActiveChatContextValue = useMemo(
    () => ({
      ...chat,
      sendMessage,
      serverStreaming,
      pendingServerApproval,
      retrying,
      lastErrorReason,
      stallSignal,
      compactionNotice,
      dismissCompactionNotice: () => setCompactionNotice(false),
      chatMeta: chatMeta ?? null,
      isLoading,
      currentModelId,
      setCurrentModel,
      currentReasoning,
      setReasoning,
      artifact,
      setArtifact,
      stopGeneration,
      isDraft,
      regenerateMessage,
      editMessage,
      editAndResend,
      approveAndResume,
      getSiblings,
    }),
    [
      chat,
      sendMessage,
      serverStreaming,
      retrying,
      lastErrorReason,
      stallSignal,
      compactionNotice,
      chatMeta,
      isLoading,
      currentModelId,
      setCurrentModel,
      currentReasoning,
      setReasoning,
      artifact,
      setArtifact,
      stopGeneration,
      isDraft,
      regenerateMessage,
      editMessage,
      editAndResend,
      approveAndResume,
      getSiblings,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      pendingServerApproval?.approvalId,
    ],
  );

  return (
    <ActiveChatContext.Provider value={value}>
      {children}
    </ActiveChatContext.Provider>
  );
}

export function useActiveChat(): ActiveChatContextValue {
  const ctx = useContext(ActiveChatContext);
  if (!ctx) {
    throw new Error("useActiveChat must be used within <ActiveChatProvider>");
  }
  return ctx;
}
