/**
 * webFetch tool — gives the model live web access on demand.
 *
 * Defined per AI SDK v6's `tool({ inputSchema, execute })` pattern (see
 * node_modules/ai/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx). The tool
 * is exposed via /api/chat when `ENABLE_WEB_FETCH=1` is set (model advertises
 * it in the next stream — the chat supports auto-tool loops
 * `stopWhen: stepCountIs(3)`).
 *
 * Surface area:
 *   url        — the URL to fetch (must be http/https)
 *   max_bytes  — capped read size so a giant page doesn't blow the prompt
 *                window; default 50_000 (~ one screen of plain text)
 *
 * Returns a JSON shape with `content` (text/plain, HTML stripped) and
 * `truncated` (boolean — true if the upstream body exceeded max_bytes so the
 * model can ask for a follow-up tool call that points deeper at a specific
 * section). On HTTP error, returns `{error}` so the model can react with text
 * rather than letting the tool throw and break the loop.
 *
 * Sandbox notes:
 *   - Default 10s timeout via AbortSignal; forwards the route's `signal` so a
 *     user-cancelled stream can abort the in-flight fetch (memory + socket
 *     cleanup).
 *   - No SSRF allowlist — the route is gated by BYPASS_CLERK during dev;
 *     Phase 9 hardening adds a same-origin-or-public allowlist before public
 *     release so the tool can't be used to probe our internal endpoints.
 *   - Only http:https: URLs; rejects `file:`, `data:`, `javascript:` upfront.
 */
import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { ChatMessage } from "@/lib/types";

const MAX_BYTES_DEFAULT = 50_000;
const FETCH_TIMEOUT_MS = 10_000;
const HTML_ENTITIES: Array<[RegExp, string]> = [
  [/&nbsp;/g, " "],
  [/&/g, "&"],
  [/</g, "<"],
  [/>/g, ">"],
  [/"/g, '"'],
  [/'/g, "'"],
];

/**
 * Strip script/style blocks then HTML tags, collapse whitespace. Good enough
 * for the model's reading; not a sanitiser (no need — already server-side).
 * Cheap regex pass over a 50 KB cap → completes well under 50 ms.
 */
function htmlToText(raw: string): string {
  let s = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ");
  for (const [re, sub] of HTML_ENTITIES) s = s.replace(re, sub);
  return s.replace(/\s+/g, " ").trim();
}

type WebFetchProps = {
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

export const webFetch = ({ dataStream: _dataStream }: WebFetchProps) =>
  tool({
    description:
      "Fetch a public http/https URL and return its readable text content. " +
      "Use this when the answer requires information from the live web " +
      "(articles, docs, recent news, raw source). For pure search " +
      "intent prefer the model's built-in knowledge; this is for cases " +
      "where freshness or a specific URL matters.",
    inputSchema: z.object({
      url: z
        .string()
        .describe("Full http or https URL to fetch."),
      max_bytes: z
        .number()
        .int()
        .min(1024)
        .max(200_000)
        .optional()
        .describe("Cap on response body size in bytes (default 50000)."),
    }),
    execute: async (
      { url, max_bytes = MAX_BYTES_DEFAULT },
      { abortSignal: routeSignal },
    ) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { error: "invalid_url", url };
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { error: "protocol_not_allowed", url, got: parsed.protocol };
      }

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      // Forward route abort → our abort so SSE cancel releases the socket.
      routeSignal?.addEventListener("abort", () => ctrl.abort());

      let res: Response;
      try {
        res = await fetch(parsed, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; Leopard/0.1; +https://leopard.chat)",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: ctrl.signal,
        });
      } catch (e) {
        clearTimeout(t);
        return {
          error: "fetch_failed",
          url,
          detail: e instanceof Error ? e.message : String(e),
        };
      }
      clearTimeout(t);

      const status = res.status;
      const ctype = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        return { error: "http_error", url, status };
      }

      // Read with a hard cap — stream-mode read so a giant body doesn't OOM
      // even if Content-Length is missing or lies.
      const reader = res.body?.getReader();
      if (!reader) return { error: "no_body", url };
      const decoder = new TextDecoder("utf-8", { fatal: false });
      let received = 0;
      let buf = "";
      let truncated = false;
      // Read enough to fill max_bytes OR see EOF.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > max_bytes) {
          // Take what fits, then bail.
          const over = received - max_bytes;
          const slice = value.subarray(0, value.byteLength - over);
          buf += decoder.decode(slice, { stream: true });
          truncated = true;
          try {
            await reader.cancel();
          } catch {}
          break;
        }
        buf += decoder.decode(value, { stream: true });
      }
      reader.releaseLock();

      const looksLikeHtml = /<[a-z][^>]*>/i.test(buf) || /text\/html/.test(ctype);
      const content = looksLikeHtml ? htmlToText(buf) : buf;

      return {
        url,
        status,
        content_type: ctype,
        bytes_read: received,
        truncated,
        content,
      };
    },
  });
