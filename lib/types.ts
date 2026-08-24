import type { UIMessage } from "ai";

/**
 * Custom UI data part types — keys are the part name WITHOUT the `data-`
 * prefix. The /api/chat route emits these via
 * `dataStream.write({ type: "data-<key>", data })`; the client's
 * `DataUIPart<CustomUIDataTypes>` matches the wire type `data-<key>`.
 *
 * `chat-title` (Phase 5): route generates a 3-5 word title on the first
 * exchange and emits it; the useActiveChat `onData` handler persists it via
 * `api.chats.updateTitle`.
 *
 * Artifact parts (Phase 6): create/update tools emit the lifecycle
 * `kind` → `id` → `title` → (`clear`) → streaming `*Delta` parts → `finish`.
 * The client's data-stream-handler assembles + persists the document to Convex
 * via `api.documents.save` on `finish` (client-persist — the route has no
 * ConvexHttpClient). `suggestion` parts (request-suggestions tool) are typed
 * now even though that tool is deferred, so the client types stay forward-fit.
 */
export type ArtifactKind = "text" | "code" | "sheet" | "image" | "file";

export type Suggestion = {
  originalText: string;
  suggestedText: string;
  description: string;
  id: string;
  documentId: string;
  isResolved: boolean;
};

export type CustomUIDataTypes = {
  "chat-title": string;
  // Artifact lifecycle (emitted by create/update tools).
  kind: ArtifactKind;
  id: string;
  title: string;
  clear: null;
  finish: null;
  // Streaming content deltas — one per artifact kind.
  textDelta: string;
  codeDelta: string;
  sheetDelta: unknown;
  imageDelta: unknown;
  // Writing suggestions (request-suggestions tool — deferred).
  suggestion: Suggestion;
};

/**
 * ChatMessage — the UIMessage shape `useChat<ChatMessage>` carries.
 *
 * `UIMessage`'s generics are `<METADATA, DATA_PARTS, TOOLS>` (in that order),
 * so `CustomUIDataTypes` binds the SECOND param (data parts). That lets
 * `InferUIMessageData<ChatMessage>` resolve to `CustomUIDataTypes`, which
 * types `useChat`'s `onData` callback as `DataUIPart<CustomUIDataTypes>` —
 * i.e. `{ type: "data-chat-title"; data: string }`. Binding it to the first
 * param would silently widen `onData` to the default `UIDataTypes`.
 *
 * Supersedes the legacy `types/index.ts` `Message` (plain `content: string`),
 * now a transitional read-only fallback for the interim components.
 */
export type ChatMessage = UIMessage<unknown, CustomUIDataTypes>;

/**
 * Minimal attachment shape. File upload + image attachments are deferred to
 * Phase 6 (convex storage.store wiring); the type is present so ported
 * component import paths typecheck in the meantime.
 */
export type Attachment = {
  url?: string;
  contentType?: string;
  name?: string;
};

export type VisibilityType = "private" | "public";
