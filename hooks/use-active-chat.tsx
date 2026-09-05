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
import { getInvokedSkillBodies } from "@/lib/skill-store";
import { getEnabledMcpServers } from "@/lib/mcp-config";
import { useSkillLibrary } from "@/hooks/use-skill-library";
import {
  stashPendingMessage,
  takePendingMessage,
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
   * opens (provider-lived; survives the dock unmounting on approval). */
  approveAndResume: (approvalId: string, approved: boolean) => void;
  /** True when the latest assistant row is still being written by the
   * detached server task and no local stream owns it — i.e. the user reopened
   * the chat mid-generation and is watching the live mirror fill in. */
  serverStreaming: boolean;
  /** Prior response texts for the turn this assistant message answers
   * (session-scoped regen history; the server rows are deleted on regen). */
  getSiblings: (messageId: string) => string[];
  /** True during the auto-retry pause after an errored run (QA M5) — lets the
   * composer show the stop state while the retry is pending/in-flight. */
  retrying: boolean;
};

const ActiveChatContext = createContext<ActiveChatContextValue | null>(null);

/** Convert a Convex message doc → a hydratable UIMessage (parts source of truth). */
function toChatMessage(m: Doc<"messages">): ChatMessage {
  return {
    id: m.id ?? String(m._id),
    role: m.role,
    // Server lifecycle rides metadata so the UI can mark a row still being
    // written by the detached route (reload/reopen mid-generation).
    metadata:
      m.status === "streaming"
        ? { serverStreaming: true }
        : undefined,
    // Normalize persisted parts (legacy `tool-*` / `step-start` are invalid in
    // the v7 UIMessage schema and would otherwise throw on reload→send —
    // lib/ai/message-parts).
    parts: normalizeUIMessageParts(
      m.parts ?? (m.content ? [{ type: "text", text: m.content }] : []),
    ) as ChatMessage["parts"],
  };
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
  const reasoningKey = (mid: string, cid?: string) =>
    cid && cid !== "draft"
      ? `leopard:reasoning:${cid}:${mid}`
      : `leopard:reasoning:${mid}`;
  const resolveReasoningFor = (mid: string, cid?: string): ReasoningLevel | undefined => {
    const cfg = getModelById(mid)?.reasoningConfig;
    if (!cfg?.enabled || !cfg.toggleable || !cfg.param) return undefined;
    try {
      if (cid && cid !== "draft") {
        const chatSaved = window.localStorage.getItem(reasoningKey(mid, cid));
        if (chatSaved) return chatSaved as ReasoningLevel;
      }
      const saved = window.localStorage.getItem(reasoningKey(mid));
      if (saved) return saved as ReasoningLevel;
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
          try {
            const body = JSON.parse(String(options?.body ?? "{}")) as {
              messages?: Array<{ parts?: Array<{ toolCallId?: string }> }>;
            };
            for (const m of body.messages ?? [])
              for (const p of m.parts ?? [])
                if (typeof p?.toolCallId === "string") known.add(p.toolCallId);
          } catch {
            /* body parse is best-effort */
          }
          const res = await fetch(url, options);
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
              controller.close();
            },
          });
          return new Response(filtered, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });
        }) as typeof fetch,
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: {
            id,
            // FULL history — /api/chat validates + converts via convertToModelMessages.
            // Normalize parts so even a live in-memory message holding legacy
            // `tool-*`/`step-start` parts still validates on the wire.
            messages: messages.map((m) => ({
              ...m,
              parts: normalizeUIMessageParts(m.parts),
            })),
            model: currentModelIdRef.current,
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

      // Φ5: route emits { type: "data-chat-title", data: "<title>" } on the
      // first exchange. Persist it; cosmetic, so swallow failures silently.
      if (part.type === "data-chat-title") {
        const u = uidRef.current;
        if (!u) return;
        void updateTitle({ chatId: convexChatId, userId: u, title: part.data });
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
    const approvalAnswered = chat.messages.some((m) =>
      m.role === "assistant" &&
      m.parts.some(
        (p) => (p as { state?: string }).state === "approval-responded",
      ),
    );
    if (approvalAnswered) return;
    chat.setMessages((prev) => {
      let changed = false;
      let next = prev.slice();

      // ── Φ10/#3 review M3: adopt the server id BY POSITION once the stream
      // settles. onData runs before the optimistic bubble exists, so the id is
      // renamed here instead. If the trailing message is an optimistic assistant
      // bubble (nanoid id, not already the server row) and the server row isn't
      // in the list yet, rename it so the merge below updates it IN PLACE rather
      // than appending the server row as a duplicate bubble.
      const sid = serverAssistantIdRef.current;
      if (sid) {
        const hasServerRow = next.some((x) => x.id === sid);
        const last = next[next.length - 1];
        if (
          last?.role === "assistant" &&
          last.id !== sid &&
          !hasServerRow
        ) {
          next[next.length - 1] = { ...last, id: sid };
          changed = true;
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
          next.push(ui);
          changed = true;
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
          next.splice(insertAt, 0, ui);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [convexMessages, chat.status, chat.setMessages, serverAssistantIdRef.current]);

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
    // Approval-resume window: a local bubble holds approval-responded state
    // the server row doesn't have yet — collapsing to the server row now
    // would delete the user's Allow/Deny before the resume POST leaves.
    const approvalAnswered = chat.messages.some((m) =>
      m.role === "assistant" &&
      m.parts.some(
        (p) => (p as { state?: string }).state === "approval-responded",
      ),
    );
    if (approvalAnswered) return;
    const serverIds = new Set((convexMessages ?? []).map((m) => m.id)); // eslint-disable-line react-hooks/exhaustive-deps
    chat.setMessages((prev) => {
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
      if (!serverHasTurn) return prev;
      // …and the present server row must already carry the content (parts can
      // lag a progressive patch behind).
      const serverRow = tail.find(
        (m) => m.role === "assistant" && serverIds.has(m.id),
      );
      if (!serverRow || serverRow.parts.length === 0) return prev;
      const keep = prev.filter(
        (m, i) =>
          i <= lastUser ||
          m.role !== "assistant" ||
          serverIds.has(m.id),
      );
      return keep.length === prev.length ? prev : keep;
    });
  }, [chat.messages, chat.status, chat.setMessages, convexMessages]);

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
    const lastIsImageGen =
      !!last && last.role === "assistant" && isImageModel(currentModelIdRef.current);

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
  const setCurrentModel = (id: string) => {
    setCurrentModelIdState(id);
    try {
      window.localStorage.setItem("leopard:last-model", id);
    } catch {
      /* ignore quota / private mode */
    }
    if (isDraft) return; // no row yet — the draft send persists the picked model
    const u = uidRef.current;
    if (u) void updateModel({ chatId: convexChatId, userId: u, model: id });
  };

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

  const stopGeneration = useCallback(() => {
      cancelRetryRef.current();
      // Only ask the server to abort when we know the detached generation's id
      // (image-gen has no server row, so local stop alone suffices). RETURNED
      // so editMessage can order: stop → (abort's partial persist lands) →
      // delete rows → resend. Fire-and-forget here raced the delete and the
      // abort's finalize upsert resurrected the old assistant row (2026-09-01).
      const sid = serverAssistantIdRef.current;
      const stopped =
        sid != null
          ? fetch("/api/chat/stop", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ assistantId: sid }),
            }).catch(() => {
              /* server already settled — local stop still ends the mirror */
            })
          : Promise.resolve();
      chat.stop();
      return stopped;
    },
    [chat.stop],
  );

  // ── Reasoning change (local state + localStorage) ──────────────────────────
  const setReasoning = (level: ReasoningLevel) => {
    setCurrentReasoning(level);
    try {
      // Per-chat key for real chats; the model-level key only moves from the
      // draft screen (it's the default for not-yet-seen chats).
      window.localStorage.setItem(reasoningKey(currentModelId, chatId), level);
    } catch {
      /* ignore quota / private mode */
    }
  };

  // ── Deferred-create: draft send mints the row, then routes ─────────────────
  // /chat mounts this provider with chatId="draft" and NO Convex row (kills the
  // empty-chat-on-every-open bug). First send: create the row, stash the parts
  // in sessionStorage, router.replace to /chat/<id>; the remounted provider
  // below picks the stash up and fires the REAL send through the normal path
  // (persistence, server title, live-mirror all behave as usual).
  const sendMessage = useCallback<ActiveChatContextValue["sendMessage"]>(
    (message, options) => {
      if (!isDraft) return chat.sendMessage(message, options);
      const u = uidRef.current;
      if (!u) return Promise.resolve(undefined as never);
      const parts =
        message && typeof message === "object" && "parts" in message
          ? (message.parts as PendingPart[])
          : [{ type: "text", text: String((message as { text?: string })?.text ?? "") }];
      return (async () => {
        const id = await createChat({
          userId: u,
          title: "New Chat",
          model: currentModelIdRef.current,
        });
        stashPendingMessage(id, parts, currentModelIdRef.current);
        router.replace(`/chat/${id}`);
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
    // Honor the model picked on the draft screen: apply it to state + the ref
    // BEFORE the send, otherwise the turn fires with the default model.
    if (pending.model && pending.model !== currentModelIdRef.current) {
      currentModelIdRef.current = pending.model;
      setCurrentModelIdState(pending.model);
      hasSyncedModelRef.current = true; // don't let the chatMeta sync override it
    }
    void chat.sendMessage({ parts: pending.parts } as never);
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
      const stopped = stopGeneration();
      const u = uidRef.current;
      const target =
        !isDraft && u && convexMessages
          ? convexMessages.find((m) => m.id === messageId)
          : undefined;
      const cleanup = target
        ? stopped
            .then(() => new Promise((r2) => setTimeout(r2, 400)))
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
      void cleanup.then(() => {
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
    [isDraft, convexMessages, convexChatId, deleteAfterTimestamp, chat, stopGeneration],
  );

  // ── Edit (user message) with server-row cleanup ───────────────────────────
  // Same resurrection trap as regen: truncating only SDK state leaves the
  // Convex rows intact, and the live-mirror heal re-inserts them — the user
  // saw their message TWICE (old server row + edited resend). Delete every
  // persisted row at-or-after the target first, then truncate local state.
  const editMessage = useCallback(
    (messageId: string) => {
      // Stop any in-flight stream FIRST — truncating the message list out from
      // under a live stream orphans it: the SDK never sees its finish chunk
      // and status sticks at "streaming", deadlocking the composer. Uses the
      // provider stop (also aborts the detached server generation).
      const stopped = stopGeneration();
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
          // assistant row. Stop, breathe 400ms, THEN delete.
          deleted = stopped
            .then(() => new Promise((r) => setTimeout(r, 400)))
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
    [isDraft, convexMessages, convexChatId, deleteAfterTimestamp, chat, stopGeneration],
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
      void Promise.resolve(editMessage(messageId)).then(() => {
        let tries = 0;
        const attempt = () => {
          // statusRef, NOT chat.status: this closure is from callback-creation
          // time; the SDK status inside it never advances.
          const st = statusRef.current;
          if (st === "streaming" || st === "submitted") {
            if (++tries < 50) setTimeout(attempt, 100);
            else editWindowRef.current = false; // give up — mirror back on
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
  const approveAndResume = useCallback(
    (approvalId: string, approved: boolean) => {
      (
        chat as unknown as {
          addToolApprovalResponse?: (r: { id: string; approved: boolean }) => void;
        }
      ).addToolApprovalResponse?.({ id: approvalId, approved });
      let tries = 0;
      const attempt = () => {
        const st = statusRef.current;
        if (st === "streaming" || st === "submitted") {
          if (++tries < 120) setTimeout(attempt, 150); // up to ~18s
          return;
        }
        void chat.sendMessage().catch(() => {
          /* surfaced via chat.error → error card */
        });
      };
      attempt();
    },
    [chat],
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
  const isLoading = isDraft
    ? false
    : badId
      ? false // malformed id → not-found UI, never a loader
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
    // Key on the last USER message id, not the assistant row: regenerate
    // mints a fresh assistant id each attempt, which made the guard re-arm on
    // every failure → infinite retry loop and the error card never showed.
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

  const value: ActiveChatContextValue = {
    ...chat,
    sendMessage,
    serverStreaming,
    retrying,
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
  };

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
