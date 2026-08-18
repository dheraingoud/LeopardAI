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
 * Backend: Tavily Search REST API (no npm dep). Gated behind
 * ENABLE_WEB_SEARCH=1 AND TAVILY_API_KEY — without both the tool simply
 * isn't advertised on the next stream (same pattern as webFetch's
 * ENABLE_WEB_FETCH, see app/api/chat/route.ts).
 *
 * Returns a JSON shape with `results` (array of {title,url,score}) and
 * `error` on failure so the model can react with text rather than throwing
 * and breaking the loop.
 */
import { tool } from "ai";
import { z } from "zod";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const TAVILY_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 8;

export type TavilyResult = { title: string; url: string; score?: number; content?: string };

/**
 * Core Tavily search — NO AI SDK tool wrapper. Returns plain structured
 * results so non-model code (the deep-research worker) can search directly.
 * `withContent` requests Tavily's advanced depth so each result carries a
 * readable snippet (`content`), which the research loop uses as raw evidence;
 * the `webSearch` tool leaves it off to keep that path content-free.
 */
export async function tavilySearch(opts: {
  query: string;
  maxResults?: number;
  withContent?: boolean;
  allowedDomains?: string[];
  blockedDomains?: string[];
  abortSignal?: AbortSignal;
}): Promise<{ results: TavilyResult[] } | { error: string; detail?: string; status?: number }> {
  const timedCtrl = new AbortController();
  const t = setTimeout(() => timedCtrl.abort(), TAVILY_TIMEOUT_MS);
  const composed = opts.abortSignal
    ? AbortSignal.any([timedCtrl.signal, opts.abortSignal])
    : timedCtrl.signal;

  let res: Response;
  try {
    res = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: opts.query,
        max_results: opts.maxResults ?? MAX_RESULTS,
        search_depth: opts.withContent ? "advanced" : "basic",
        ...(opts.allowedDomains?.length ? { include_domains: opts.allowedDomains } : {}),
        ...(opts.blockedDomains?.length ? { exclude_domains: opts.blockedDomains } : {}),
      }),
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

  const data = (await res.json().catch(() => ({}))) as {
    results?: Array<{ title?: string; url?: string; score?: number; content?: string }>;
    error?: string;
  };
  if (data.error) return { error: "search_api_error", detail: data.error };

  const results = (data.results ?? [])
    .filter((r) => r.title && r.url)
    .slice(0, opts.maxResults ?? MAX_RESULTS)
    .map((r) => ({
      title: r.title as string,
      url: r.url as string,
      score: typeof r.score === "number" ? r.score : undefined,
      ...(opts.withContent && r.content ? { content: r.content } : {}),
    }));

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
      const out = await tavilySearch({
        query: input.query,
        allowedDomains: input.allowed_domains,
        blockedDomains: input.blocked_domains,
        abortSignal,
      });
      if ("error" in out) {
        // Tavily 401 → bad key; 429 → rate limit. Surface status so the model
        // knows the tool is temporarily unavailable, not a bad query.
        return { error: out.error, detail: out.detail, status: out.status };
      }
      return { query: input.query, results: out.results.map(({ title, url, score }) => ({ title, url, score })) };
    },
  });