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
      const timedCtrl = new AbortController();
      const t = setTimeout(() => timedCtrl.abort(), TAVILY_TIMEOUT_MS);
      const composed = abortSignal
        ? AbortSignal.any([timedCtrl.signal, abortSignal])
        : timedCtrl.signal;

      let res: Response;
      try {
        res = await fetch(TAVILY_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: process.env.TAVILY_API_KEY,
            query: input.query,
            max_results: MAX_RESULTS,
            // Empty arrays would be sent as "allowances" — omit when unset.
            ...(input.allowed_domains?.length
              ? { include_domains: input.allowed_domains }
              : {}),
            ...(input.blocked_domains?.length
              ? { exclude_domains: input.blocked_domains }
              : {}),
          }),
          signal: composed,
        });
      } catch (e) {
        clearTimeout(t);
        return {
          error: "search_failed",
          detail: e instanceof Error ? e.message : String(e),
        };
      }
      clearTimeout(t);

      if (!res.ok) {
        // Tavily 401 → bad key; 429 → rate limit. Give the model the status
        // so it knows the tool is temporarily unavailable, not a bad query.
        return { error: "search_http_error", status: res.status };
      }

      const data = (await res.json().catch(() => ({}))) as {
        results?: Array<{ title?: string; url?: string; score?: number }>;
        error?: string;
      };

      if (data.error) return { error: "search_api_error", detail: data.error };

      const results = (data.results ?? [])
        .filter((r) => r.title && r.url)
        .slice(0, MAX_RESULTS)
        .map((r) => ({
          title: r.title as string,
          url: r.url as string,
          score: typeof r.score === "number" ? r.score : undefined,
        }));

      return { query: input.query, results };
    },
  });