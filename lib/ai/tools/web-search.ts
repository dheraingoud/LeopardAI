/**
 * webSearch tool — gives the model live web discovery.
 *
 * Mirrors Claude's web_search contract: inputs query (+ optional
 * allowed_domains XOR blocked_domains), returns TITLES + URLS ONLY (never
 * page content). Content retrieval stays on webFetch, so the two compose:
 * search → pick a URL → fetch the page. Keeping search output content-free
 * keeps context lean and forces the model to be deliberate about what it
 * actually opens.
 *
 * Backend: DuckDuckGo's keyless HTML endpoint (2026-08-31 — replaced Tavily;
 * no API key required). Gated behind ENABLE_WEB_SEARCH=1 — without it the
 * tool isn't advertised on the next stream (same pattern as webFetch's
 * ENABLE_WEB_FETCH, see app/api/chat/route.ts).
 *
 * Returns a JSON shape with `results` (array of {title,url}) and `error` on
 * failure so the model can react with text rather than throwing and breaking
 * the loop.
 */
import { tool } from "ai";
import { z } from "zod";

const DDG_ENDPOINT = "https://html.duckduckgo.com/html/";
const SEARCH_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 8;

export type WebResult = { title: string; url: string; score?: number; content?: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

/** Parse DDG html results: <a class="result__a" href="/l/?uddg=<enc>…">title</a> */
function parseResults(html: string, max: number): WebResult[] {
  const out: WebResult[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < max) {
    const href = decodeEntities(m[1]);
    const title = decodeEntities(stripTags(m[2])).trim();
    let url = href;
    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (uddg) {
      try {
        url = decodeURIComponent(uddg[1]);
      } catch {
        continue;
      }
    }
    if (!title || !/^https?:\/\//.test(url)) continue;
    out.push({ title, url });
  }
  return out;
}

/** Snippet per result (research loop's evidence) from result__snippet blocks. */
function parseSnippets(html: string): string[] {
  const out: string[] = [];
  const re = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(decodeEntities(stripTags(m[1])).trim());
  return out;
}

/**
 * Core web search — NO AI SDK tool wrapper. Returns plain structured results
 * so non-model code (the deep-research worker) can search directly.
 * `withContent` attaches the result snippet as `content`, which the research
 * loop uses as raw evidence; the `webSearch` tool leaves it off to keep that
 * path content-free.
 */
export async function searchWeb(opts: {
  query: string;
  maxResults?: number;
  withContent?: boolean;
  allowedDomains?: string[];
  blockedDomains?: string[];
  abortSignal?: AbortSignal;
}): Promise<{ results: WebResult[] } | { error: string; detail?: string; status?: number }> {
  const timedCtrl = new AbortController();
  const t = setTimeout(() => timedCtrl.abort(), SEARCH_TIMEOUT_MS);
  const composed = opts.abortSignal
    ? AbortSignal.any([timedCtrl.signal, opts.abortSignal])
    : timedCtrl.signal;

  let res: Response;
  try {
    res = await fetch(DDG_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) leopard-chat",
      },
      body: new URLSearchParams({ q: opts.query }).toString(),
      signal: composed,
    });
  } catch (e) {
    clearTimeout(t);
    return { error: "search_failed", detail: e instanceof Error ? e.message : String(e) };
  }
  clearTimeout(t);

  if (!res.ok) {
    return { error: "search_http_error", status: res.status };
  }

  const html = await res.text();
  let results = parseResults(html, opts.maxResults ?? MAX_RESULTS);

  if (opts.allowedDomains?.length) {
    results = results.filter((r) => opts.allowedDomains!.some((d) => r.url.includes(d)));
  }
  if (opts.blockedDomains?.length) {
    results = results.filter((r) => !opts.blockedDomains!.some((d) => r.url.includes(d)));
  }

  if (opts.withContent) {
    const snippets = parseSnippets(html);
    results = results.map((r, i) => (snippets[i] ? { ...r, content: snippets[i] } : r));
  }

  return { results };
}

export const webSearch = () =>
  tool({
    description:
      "Search the public web for a query and return a ranked list of " +
      "results with titles and URLs. Use this to discover relevant pages, " +
      "then call webFetch to read a specific result's content. This tool " +
      "returns NO page content — only titles and URLs.",
    inputSchema: z
      .object({
        query: z.string().describe("The search query (natural language)."),
        allowed_domains: z
          .array(z.string())
          .optional()
          .describe(
            "Restrict results to these domains. Mutually exclusive with blocked_domains.",
          ),
        blocked_domains: z
          .array(z.string())
          .optional()
          .describe(
            "Exclude results from these domains. Mutually exclusive with allowed_domains.",
          ),
      })
      .refine(
        (v) => !(v.allowed_domains && v.blocked_domains),
        "allowed_domains and blocked_domains are mutually exclusive",
      ),
    execute: async (input, { abortSignal }) => {
      const out = await searchWeb({
        query: input.query,
        allowedDomains: input.allowed_domains,
        blockedDomains: input.blocked_domains,
        abortSignal,
      });
      if ("error" in out) {
        return { error: out.error, detail: out.detail, status: out.status };
      }
      return { query: input.query, results: out.results.map(({ title, url, score }) => ({ title, url, score })) };
    },
  });
