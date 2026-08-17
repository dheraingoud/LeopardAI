/**
 * webFetch tool — gives the model live web access on demand.
 *
 * Defined per AI SDK v6's tool({ inputSchema, execute }) pattern (see
 * node_modules/ai/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx). The tool
 * is exposed via /api/chat when ENABLE_WEB_FETCH=1 is set (model advertises
 * it in the next stream — the chat supports auto-tool loops
 * stopWhen: stepCountIs(3)).
 *
 * Surface area:
 *   url        — the URL to fetch (must be http/https)
 *   max_bytes  — capped read size so a giant page doesn't blow the prompt
 *                window; default 40_000 (~ one screen of reading text)
 *
 * Returns a JSON shape with `content` (text/plain, HTML stripped) and
 * `truncated` (boolean — true if the upstream body exceeded max_bytes so the
 * model can ask for a follow-up tool call that points deeper at a specific
 * section). On HTTP error, returns {error} so the model can react with text
 * rather than letting the tool throw and break the loop.
 *
 * Sandbox notes:
 *   - Default 10s timeout via AbortSignal; forwards the route's abort signal
 *     so a user-cancelled stream can abort the in-flight fetch (memory +
 *     socket cleanup). AbortSignal.any() composes both into one signal so a
 *     single source flows into fetch — no manual listener bookkeeping.
 *   - No SSRF allowlist — the route is gated by BYPASS_CLERK during dev;
 *     Phase 9 hardening adds a same-origin-or-public allowlist before
 *     public release so the tool can't be used to probe our internal
 *     endpoints.
 *   - Only http:https: URLs; rejects file:, data:, javascript: upfront.
 */
import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { ChatMessage } from "@/lib/types";
import {
  hostFromUrl,
  resolveFetchHostPolicy,
} from "@/lib/ai/fetch-policy";
import { redactUrlForDisplay } from "@/lib/redact";

const MAX_BYTES_DEFAULT = 50_000;
const FETCH_TIMEOUT_MS = 10_000;

// HTML entity decoder: uses Buffer.from() at module load to guarantee the
// regex source contains LITERAL HTML-entity text bytes. The Write tool's
// HTML entity decode was escaping & to literal & so we went back to
// string concatenation with explicit char codes.
//
// Order matters: amp MUST decode FIRST. Otherwise lt (escaped
// less-than) double-decodes to literal < instead of the intended <.
// The regexes match the literal HTML-entity text — not the leading
// ampersand alone — so lt collapses to < in a single pass.
const AMP = String.fromCharCode(38);
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const DQ = String.fromCharCode(34);
const SQ = String.fromCharCode(39);
const SP = String.fromCharCode(32);

function makeEntry(name: string, replacement: string): [RegExp, string] {
  // Path-for-: amp_lt_gt_quot_apos_nbsp
  const pattern = "/" + AMP + name + ";/g";
  return [new RegExp(pattern, "g"), replacement];
}

// Build the entity lists. Entities we don't ship here: amp surrogate pair
// (only used twice — rare), curly quote entities (model doesn't care).
const HTML_ENTITIES: Array<[RegExp, string]> = [
  makeEntry("amp", AMP),
  makeEntry("lt", LT),
  makeEntry("gt", GT),
  makeEntry("quot", DQ),
  makeEntry("apos", SQ),
  makeEntry("nbsp", SP),
];

/**
 * Strip frameworks' noisy shell to a clean reading surface, then tags →
 * text. Beyond script/style, drops the boilerplate that dominates Next.js /
 * SPA pages (nav, header, footer, aside, iFrames, hidden RSC payloads, inline
 * JSON) so a 200 KB appliance page degrades to a few KB of the actual
 * content the model cares about — no more "truncated at ~200KB due to
 * framework serialization" in answers. Cheap regex passes over a bounded
 * input; not a sanitiser (server-side only).
 */
function htmlToText(raw: string): string {
  // Remove whole noise subtrees before any tag stripping so their inner text
  // (nav labels, cookie banners, hidden RSC JSON) never becomes "content".
  const drop = [
    /<script[\s\S]*?<\/script>/gi,
    /<style[\s\S]*?<\/style>/gi,
    /<noscript[\s\S]*?<\/noscript>/gi,
    /<template[\s\S]*?<\/template>/gi,
    /<!--[\s\S]*?-->/g,
    /<(nav|header|footer|aside|iframe)[\s>][\s\S]*?<\/\1>/gi,
    // Next.js RSC / framework wire data are dumped as hidden text nodes /
    // divs consumed by the client — strip them. (script/style already gone;
    // these catch the JSON blobs Next embeds as visible body text.)
    /<[^>]*data-rsc-collection[^>]*>[\s\S]*?<\/div>/gi,
  ];
  let s = raw;
  for (const re of drop) s = s.replace(re, "");
  s = s.replace(/<[^>]+>/g, " ");
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
        .max(120_000)
        .optional()
        .describe("Cap on response body size in bytes (default 40000)."),
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

      // SSRF gate (claude-code-docs perms/mcp): a public fetch tool must never
      // reach private/internal hosts. Private/loopback/link-local + any
      // denylisted host are refused; if LEOPARD_FETCH_ALLOWLIST is set, only
      // matching hosts pass. Enforced BEFORE any network I/O.
      const hostname = hostFromUrl(url) ?? "";
      const verdict = resolveFetchHostPolicy(hostname);
      if (!verdict.allowed) {
        return { error: "host_blocked", url: redactUrlForDisplay(url), reason: verdict.reason };
      }

      // Compose route abort + our 10s timeout into a single AbortSignal
      // (Node 20+) so one signal flows into fetch(). Eliminates manual
      // addEventListener bookkeeping that would otherwise leak listeners over
      // multi-step tool loops.
      const timedCtrl = new AbortController();
      const t = setTimeout(() => timedCtrl.abort(), FETCH_TIMEOUT_MS);
      const composed = routeSignal
        ? AbortSignal.any([timedCtrl.signal, routeSignal])
        : timedCtrl.signal;

      let res: Response;
      try {
        res = await fetch(parsed, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; Leopard/0.1; +https://leopard.chat)",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: composed,
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
      const clean = looksLikeHtml ? htmlToText(buf) : buf;

      // Prompt-injection guard (docs/mcp.md): mark fetched content as UNTRUSTED
      // DATA via provenance delimiters so the model (which is told in the system
      // prompt to treat web content as data, never instructions) can ignore any
      // directive a hostile page smuggles in. The source URL is redacted for
      // display in case it carries creds/tokens.
      const safeUrl = redactUrlForDisplay(url);
      const content = `<web_content source="${safeUrl}">\n${clean}\n</web_content>`;

      return {
        url: safeUrl,
        status,
        content_type: ctype,
        bytes_read: received,
        truncated,
        content,
      };
    },
  });
