import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from "@/lib/artifacts/server";
import type { ChatMessage } from "@/lib/types";

/**
 * createDocument tool — the model calls this to spin up an artifact. Adapted
 * from vercel-chatbot's `lib/ai/tools/create-document.ts`:
 *
 * - No `session` param (leopard uses Clerk; tools don't carry a Session).
 * - `id` minted server-side via the Web Crypto global (`crypto.randomUUID`)
 *   rather than a `generateUUID` util — Node 19+ exposes it as a global in the
 *   `nodejs` runtime, which the /api/chat route pins (`export const runtime =
 *   "nodejs"`). The id rides the `data-id` part to the client.
 * - No server-side document save. The lifecycle parts (`data-kind` → `data-id`
 *   → `data-title` → `data-clear` → streaming `data-*Delta` → `data-finish`)
 *   are consumed by the client's data-stream-handler, which persists the
 *   assembled document to Convex via `api.documents.save`. See
 *   `lib/artifacts/server.ts` for the rationale.
 *
 * The tool's RETURN value becomes the tool result the model sees in the next
 * step; with `stopWhen: stepCountIs(5)` the model emits a brief confirmation
 * after the artifact streams (the artifactsPrompt tells it to keep that to one
 * sentence and never echo the artifact content).
 */
type CreateDocumentProps = {
  dataStream: UIMessageStreamWriter<ChatMessage>;
  modelId: string;
};

export const createDocument = ({ dataStream, modelId }: CreateDocumentProps) =>
  tool({
    description:
      "Create a downloadable file card that appears in the chat after your reply. Use this whenever the user asks for a real file ('.md file', '.txt file', '.json', '.csv', 'a script', 'make me a sheet', etc). Set kind='file' for any arbitrary file and include the extension in the title (e.g. title: 'notes.md'). kind='text' for a document/essay. kind='code' for a script. kind='sheet' for tabular/CSV data.",
    inputSchema: z.object({
      title: z
        .string()
        .describe(
          "The filename with extension (e.g. 'notes.md', 'data.csv', 'script.py', 'draft.txt'). Extension drives the file type + download."
        ),
      kind: z
        .enum(artifactKinds)
        .describe(
          "REQUIRED. 'file' for any downloadable file (md/txt/json/csv/script — include the extension in the title), 'text' for essays/writing, 'code' for a script, 'sheet' for tabular data"
        ),
    }),
    execute: async ({ title, kind }) => {
      const id = crypto.randomUUID();

      dataStream.write({ type: "data-kind", data: kind, transient: true });
      dataStream.write({ type: "data-id", data: id, transient: true });
      dataStream.write({ type: "data-title", data: title, transient: true });
      dataStream.write({ type: "data-clear", data: null, transient: true });

      const documentHandler = documentHandlersByArtifactKind.find(
        (h) => h.kind === kind,
      );

      if (!documentHandler) {
        // code/sheet/image handlers ship in the next increment; surface a
        // clear error so onError maps it instead of streaming a stale panel.
        throw new Error(`No document handler found for kind: ${kind}`);
      }

      // Stall guard: the inner document stream runs OUTSIDE the chat turn's
      // own watchdogs. An upstream that opens then hangs (observed on NIM)
      // would otherwise park the generation forever — the assistant row stays
      // a seed-only "approval-responded" placeholder (X4.2, 2026-09-05). Abort
      // after 60s without a content delta; whatever streamed is kept.
      const ctrl = new AbortController();
      let lastDelta = Date.now();
      const guardedStream = {
        ...dataStream,
        write: (chunk: Parameters<typeof dataStream.write>[0]) => {
          if ((chunk as { type?: string })?.type === "data-textDelta") {
            lastDelta = Date.now();
          }
          dataStream.write(chunk);
        },
      } as typeof dataStream;
      const guard = setInterval(() => {
        if (Date.now() - lastDelta > 60_000) ctrl.abort();
      }, 5_000);
      try {
        await documentHandler.onCreateDocument({
          id,
          title,
          dataStream: guardedStream,
          modelId,
          signal: ctrl.signal,
        });
      } catch (e) {
        // An abort after partial content is not an error — finish what we have.
        if (!ctrl.signal.aborted) throw e;
      } finally {
        clearInterval(guard);
      }

      dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        id,
        title,
        kind,
        content:
          kind === "code"
            ? "A script was created and is now visible to the user."
            : kind === "file"
              ? "A file was created and is now visible to the user."
              : "A document was created and is now visible to the user.",
      };
    },
  });
