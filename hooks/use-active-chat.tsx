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
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { getDefaultChatModel, getModelById } from "@/lib/ai/models";
import type { ReasoningLevel } from "@/lib/nim";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";
import {
  sanitizeMessageForStorage,
  persistImagesForMessage,
  type ImageCacheEntry,
} from "@/lib/image-cache";
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
  /** Suggested follow-up questions per assistant message id (ephemeral, not persisted). */
  suggestionsByMessage: Record<string, string[]>;
};

const ActiveChatContext = createContext<ActiveChatContextValue | null>(null);

/** Convert a Convex message doc → a hydratable UIMessage (parts source of truth). */
function toChatMessage(m: Doc<"messages">): ChatMessage {
  return {
    id: m.id ?? String(m._id),
    role: m.role,
    parts: (m.parts ??
      (m.content ? [{ type: "text", text: m.content }] : [])) as ChatMessage["parts"],
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
  // TEMP: DEV_USER_ID fallback when BYPASS_CLERK is on (Phase 5 browser E2E).
  const uid: string | undefined = user?.id ?? (BYPASS_CLERK ? DEV_USER_ID : undefined);
  const convexChatId = chatId as Id<"chats">;

  // ── Convex: load chat + messages ──────────────────────────────────────────
  const chatMeta = useQuery(api.chats.get, { chatId: convexChatId, userId: uid });
  const convexMessages = useQuery(api.messages.list, { chatId: convexChatId });

  // ── Convex: mutations (stable refs from useMutation) ──────────────────────
  const messagesSend = useMutation(api.messages.send);
  const updateTitle = useMutation(api.chats.updateTitle);
  const updateModel = useMutation(api.chats.updateModel);
  const touchChat = useMutation(api.chats.touch);
  // Φ6: persist assembled artifact doc on stream finish (client-persist —
  // route has no ConvexHttpClient by design; mirrors messages.send pattern).
  const documentsSave = useMutation(api.documents.save);

  // ── Selected model ─────────────────────────────────────────────────────────
  const [currentModelId, setCurrentModelIdState] = useState<string>(
    () => getDefaultChatModel().id,
  );
  // Sync ONCE from the loaded chat (race-guard: don't clobber a user pick made
  // before chatMeta arrived). Provider is keyed by chatId, so the ref resets on
  // every chat switch — first sync is the saved chat model.
  const hasSyncedModelRef = useRef(false);
  useEffect(() => {
    if (chatMeta?.model && !hasSyncedModelRef.current) {
      hasSyncedModelRef.current = true;
      setCurrentModelIdState(chatMeta.model);
    }
  }, [chatMeta?.model]);
  // Ref so the transport (created once) reads the latest model without
  // re-constructing itself on every model change.
  const currentModelIdRef = useRef(currentModelId);
  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  // ── Selected reasoning level (per-model, persisted client-side) ────────────
  // localStorage-scoped per model id so switching models recalls each model's
  // last pick. Initialized from the model's defaultEffort (curated in
  // MODEL_REGISTRY) the first time a model is seen. undefined for models with
  // no reasoning knob (locked-on Cosmos reasoners / reasoning-disabled) — the
  // route then omits the param and sendReasoning handles surfacing parts.
  const reasoningKey = (mid: string) => `leopard:reasoning:${mid}`;
  const resolveReasoningFor = (mid: string): ReasoningLevel | undefined => {
    const cfg = getModelById(mid)?.reasoningConfig;
    if (!cfg?.enabled || !cfg.toggleable || !cfg.param) return undefined;
    try {
      const saved = window.localStorage.getItem(reasoningKey(mid));
      if (saved) return saved as ReasoningLevel;
    } catch {
      /* ignore quota / private mode */
    }
    return cfg.defaultEffort;
  };
  const [currentReasoning, setCurrentReasoning] = useState<
    ReasoningLevel | undefined
  >(() => (typeof window === "undefined" ? undefined : resolveReasoningFor(currentModelId)));
  const currentReasoningRef = useRef(currentReasoning);
  useEffect(() => {
    currentReasoningRef.current = currentReasoning;
  }, [currentReasoning]);
  // Re-resolve reasoning when the model switches (recall saved pick or default).
  /* eslint-disable react-hooks/exhaustive-deps -- intentionally runs only on
     model switch; resolveReasoningFor is a pure localStorage reader and must
     not trigger a re-run on every render. */
  useEffect(() => {
    setCurrentReasoning(resolveReasoningFor(currentModelId));
  }, [currentModelId]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // `uid` ref: useChat binds onData/onError at Chat construction; read the
  // latest uid via ref so a SessionLoaded → signed-in transition still
  // persists the title. Falls back to DEV_USER_ID under BYPASS_CLERK.
  const uidRef = useRef(uid);
  useEffect(() => {
    uidRef.current = uid;
  }, [uid]);

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
  // Suggested follow-up chips: messageId → string[]. Ephemeral (never Convex);
  // populated fire-and-forget after an assistant stream finishes.
  const [suggestionsByMessage, setSuggestionsByMessage] = useState<
    Record<string, string[]>
  >({});

  // Fire the /api/suggest request for a finished assistant message. No-op on
  // error / no key → the message just renders without chips.
  const requestSuggestions = useCallback(async (messageId: string, text: string) => {
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, modelId: currentModelIdRef.current }),
      });
      if (!res.ok) return;
      const { suggestions } = (await res.json()) as { suggestions?: string[] };
      if (Array.isArray(suggestions) && suggestions.length > 0) {
        setSuggestionsByMessage((prev) => ({ ...prev, [messageId]: suggestions }));
      }
    } catch {
      /* cosmetic — no chips is fine */
    }
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
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: {
            id,
            // FULL history — /api/chat validates + converts via convertToModelMessages.
            messages,
            model: currentModelIdRef.current,
            // Per-model reasoning level (undefined for locked-on/no-knob models
            // → route omits the key → NIM non-think / no param). Route.ts reads
            // this + nimReasoningProviderOptions() builds providerOptions.nim.
            reasoning: currentReasoningRef.current,
          },
        }),
      }),
    [],
  );
  // eslint-enable react-hooks/refs

  // ── useChat ───────────────────────────────────────────────────────────────
  const chat = useChat<ChatMessage>({
    id: chatId,
    generateId: nanoid,
    transport,
    onError: (error) => {
      toast.error(error.message || "Stream error");
    },
    onData: (part) => {
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
  useEffect(() => {
    if (!convexMessages || hydratedRef.current) return;
    hydratedRef.current = true;
    const hydrated = convexMessages.map(toChatMessage);
    for (const m of hydrated) persistedIdsRef.current.add(m.id);
    chat.setMessages(hydrated);
  }, [convexMessages, chat.setMessages]);

  // ── Persist effect: dedup-by-id; user msgs immediate; assistant on ready ─
  useEffect(() => {
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
          parts: m.parts,
          id: m.id,
          model: currentModelIdRef.current,
        });
      }
    }

    // Assistant message: persist only once the stream is finished (status
    // "ready") so we don't store a partial. Touch the chat's updatedAt.
    const last = chat.messages[chat.messages.length - 1];
    if (
      last &&
      last.role === "assistant" &&
      !persistedIdsRef.current.has(last.id) &&
      chat.status === "ready"
    ) {
      persistedIdsRef.current.add(last.id);

      // Φ8: image-cache (the base64-loss fix). Sanitize any image markdown
      // (remote url / data: / blob:) in a text part → a `#img-${id}` placeholder
      // + collect the real URLs. Store the SANITIZED parts to Convex (no base64
      // in the row) and write {id,url} entries to IndexedDB (lib/image-cache)
      // so the render path (message.tsx) hydrates placeholders back on reload.
      // Dormant for text-only chats — sanitizeMessageForStorage returns content
      // unchanged + images:[] when there's no image markdown, so non-gen
      // messages pass through untouched (sanitizedParts === last.parts shape).
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
        parts: sanitizedParts,
        id: last.id,
        model: currentModelIdRef.current,
      });
      void touchChat({ chatId: convexChatId });

      // Suggested follow-up chips: fire-and-forget, never blocks the reply.
      const assistantText = sanitizedParts
        .filter((p) => p.type === "text")
        .map((p) => (p as { text?: string }).text ?? "")
        .join(" ")
        .trim();
      if (assistantText) void requestSuggestions(last.id, assistantText);
    }
  }, [chat.messages, chat.status, convexChatId, messagesSend, requestSuggestions, touchChat]);

  // ── Model change (local state + persist) ───────────────────────────────────
  const setCurrentModel = (id: string) => {
    setCurrentModelIdState(id);
    const u = uidRef.current;
    if (u) void updateModel({ chatId: convexChatId, userId: u, model: id });
  };

  // ── Reasoning change (local state + localStorage) ──────────────────────────
  const setReasoning = (level: ReasoningLevel) => {
    setCurrentReasoning(level);
    try {
      window.localStorage.setItem(reasoningKey(currentModelId), level);
    } catch {
      /* ignore quota / private mode */
    }
  };

  const isLoading = chatMeta === undefined || convexMessages === undefined;
  const value: ActiveChatContextValue = {
    ...chat,
    chatMeta: chatMeta ?? null,
    isLoading,
    currentModelId,
    setCurrentModel,
    currentReasoning,
    setReasoning,
    artifact,
    setArtifact,
    suggestionsByMessage,
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
