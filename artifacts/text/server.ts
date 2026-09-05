import { smoothStream, streamText } from "ai";
import { createDocumentHandler } from "@/lib/artifacts/server";
import { updateDocumentPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";

/**
 * Text artifact handler — streams a markdown document word-by-word into the
 * UIMessage stream as `data-textDelta` parts. The client's data-stream-handler
 * concatenates the deltas + persists the assembled document to Convex via
 * `api.documents.save` on `data-finish` (client-persist — see
 * `lib/artifacts/server.ts`).
 *
 * Adapted from vercel-chatbot's `artifacts/text/server.ts`;
 * - dropped the `session` param (leopard uses Clerk; tools don't carry a
 *   Session object).
 * - `smoothStream({ chunking: "word" })` retained — gives the streaming-typing
 *   feel in the side panel.
 * - `onUpdateDocument` is defined for completeness (the `updateDocument` tool
 *   lands with edit/update in the next increment); unused at runtime until
 *   then but kept so the handler contract + prompts stay in sync.
 */
export const textDocumentHandler = createDocumentHandler<"text">({
  kind: "text",
  onCreateDocument: async ({ title, dataStream, modelId, signal }) => {
    const { fullStream } = streamText({
      model: getLanguageModel(modelId),
      system:
        "Write about the given topic. Markdown is supported. Use headings wherever appropriate.",
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: title,
      abortSignal: signal,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        dataStream.write({
          type: "data-textDelta",
          data: delta.text,
          transient: true,
        });
      }
    }
  },
  onUpdateDocument: async ({ document, description, dataStream, modelId, signal }) => {
    const { fullStream } = streamText({
      model: getLanguageModel(modelId),
      system: updateDocumentPrompt(document.content, "text"),
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: description,
      abortSignal: signal,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        dataStream.write({
          type: "data-textDelta",
          data: delta.text,
          transient: true,
        });
      }
    }
  },
});
