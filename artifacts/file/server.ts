import { smoothStream, streamText } from "ai";
import { createDocumentHandler } from "@/lib/artifacts/server";
import { getLanguageModel } from "@/lib/ai/providers";

/**
 * Generic file artifact handler — the backbone of downloadable file cards.
 *
 * Covers kind "file" (any requested file: .md / .txt / .json / .csv / scripts)
 * AND kind "code" / "sheet", which alias here so the model can file-ify any
 * content WITHOUT a dedicated editor. Everything streams as `data-textDelta`
 * (reusing the text handler's on-wire shape) so the client's data-stream
 * handler assembles the content and persists it to Convex via
 * `api.documents.save` on `data-finish` — the exact same path the text handler
 * already proves end-to-end. The client's FileCard (components/chat/message.tsx)
 * then fetches the assembled doc via `api.documents.getLatest` and renders
 * Preview + Download without re-assembling or double-storing.
 *
 * The system prompt is deliberately compact (NIM has NO prompt caching — every
 * request re-sends the full prompt): a single instruction to emit ONLY the file
 * content, no fences/explanation, format implied by the title's extension. Kept
 * to one sentence to stay token-cheap.
 */
const FILE_SYSTEM_PROMPT =
  "Write the complete content for the requested file. Output ONLY the file content — no explanations, no introductions, no markdown fences or code-block wrappers. Match the format implied by the title's extension (.md markdown, .txt plain text, .json valid JSON, .csv comma-separated, .py / .ts / .tsx / .js source code, .html, .css, etc.). If no extension, match the user's described format.";

/** Single handler factory: identical streaming body, distinguished by kind. */
function fileStreamHandler(
  kind: "file" | "code" | "sheet",
): ReturnType<typeof createDocumentHandler<typeof kind>> {
  return createDocumentHandler({
    kind,
    onCreateDocument: async ({ title, dataStream, modelId, signal }) => {
      const { fullStream } = streamText({
        model: getLanguageModel(modelId),
        system: FILE_SYSTEM_PROMPT,
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
    // updateDocument is deferred (needs a server-side ConvexHttpClient read —
    // see lib/artifacts/server.ts rationale). No-op so the handler contract +
    // prompts stay in sync once it lands.
    onUpdateDocument: async () => {},
  });
}

export const fileDocumentHandler = fileStreamHandler("file");
export const codeDocumentHandler = fileStreamHandler("code");
export const sheetDocumentHandler = fileStreamHandler("sheet");