import type { UIMessageStreamWriter } from "ai";
import { textDocumentHandler } from "@/artifacts/text/server";
import {
  codeDocumentHandler,
  fileDocumentHandler,
  sheetDocumentHandler,
} from "@/artifacts/file/server";
import type { ArtifactKind } from "@/lib/types";
import type { ChatMessage } from "@/lib/types";

/**
 * Artifact registry (server side). Mirrors vercel-chatbot's
 * `lib/artifacts/server.ts` with one leopard adaptation: NO server-side
 * `saveDocument`. The /api/chat route has no ConvexHttpClient (Phase 5
 * client-persist decision — the route validates/auths/streams only), so a tool
 * execute function cannot write to Convex. Instead the tool streams the
 * document-build lifecycle + content deltas as `data-*` parts; the client's
 * data-stream-handler assembles the final document and persists it to Convex
 * via `api.documents.save` (mirroring how `messages.send` is client-driven).
 *
 * Consequences:
 *  - `createDocumentHandler` is a thin pass-through (no `saveDocument` wrapper)
 *    — the handler's onCreate/onUpdate just stream; the return value is unused.
 *  - `updateDocument` / `requestSuggestions` tools (which must READ an existing
 *    document server-side to rewrite it) are deferred: they need a
 *    ConvexHttpClient in the route plus an auth decision, slotted for Phase 9.
 *    Only `createDocument` is live in this increment.
 *  - Only the `text` handler is registered here. `code` / `sheet` / `image`
 *    handlers + their editor components port in the next increment; until
 *    then `createDocument({ kind: "code" | "sheet" })` throws "no handler"
 *    and `onError` surfaces a user-safe message.
 */

export type CreateDocumentCallbackProps = {
  id: string;
  title: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  modelId: string;
};

export type UpdateDocumentCallbackProps = {
  document: {
    id: string;
    title: string;
    kind: ArtifactKind;
    content: string;
  };
  description: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  modelId: string;
};

export type DocumentHandler<T extends ArtifactKind = ArtifactKind> = {
  kind: T;
  onCreateDocument: (args: CreateDocumentCallbackProps) => Promise<void>;
  onUpdateDocument: (args: UpdateDocumentCallbackProps) => Promise<void>;
};

/**
 * Thin pass-through. vercel-chatbot's wrapper collects the `draftContent`
 * return + calls `saveDocument` server-side; leopard's client persists, so we
 * just delegate. The config contract still accepts the same shape ( handy when
 * the code/sheet/image handlers port — they share this factory).
 */
export function createDocumentHandler<T extends ArtifactKind>(config: {
  kind: T;
  onCreateDocument: (params: CreateDocumentCallbackProps) => Promise<void>;
  onUpdateDocument: (params: UpdateDocumentCallbackProps) => Promise<void>;
}): DocumentHandler<T> {
  return config;
}

export const documentHandlersByArtifactKind: DocumentHandler[] = [
  textDocumentHandler,
  // Generic file handler (kind "file") + code/sheet aliases — all three stream
  // via data-textDelta so ANY requested file (md/txt/json/csv/script) assembles
  // client-side, persists to Convex, and renders as a downloadable FileCard.
  // No handler throws "No document handler found" anymore; imageDocumentHandler
  // stays deferred (needs an image editor).
  fileDocumentHandler,
  codeDocumentHandler,
  sheetDocumentHandler,
];

/** Kinds the createDocument tool advertises to the model. Matches the union
 * the input schema accepts. Every kind has a registered handler (text + the
 * file/code/sheet trio above). */
export const artifactKinds = ["text", "file", "code", "sheet"] as const;
