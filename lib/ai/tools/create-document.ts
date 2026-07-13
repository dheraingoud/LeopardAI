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
      "Create an artifact. You MUST specify kind: use 'code' for any programming/algorithm request (creates a script), 'text' for essays/writing (creates a document), 'sheet' for spreadsheets/data.",
    inputSchema: z.object({
      title: z.string().describe("The title of the artifact"),
      kind: z
        .enum(artifactKinds)
        .describe(
          "REQUIRED. 'code' for programming/algorithms, 'text' for essays/writing, 'sheet' for spreadsheets"
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

      await documentHandler.onCreateDocument({
        id,
        title,
        dataStream,
        modelId,
      });

      dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        id,
        title,
        kind,
        content:
          kind === "code"
            ? "A script was created and is now visible to the user."
            : "A document was created and is now visible to the user.",
      };
    },
  });
