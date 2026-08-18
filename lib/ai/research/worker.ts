// ═══════════════════════════════════════════════════════════════════════════
// Φ-docs · deep-research worker (detached subagent).
//
// A mini research agent that runs OUTSIDE the main chat stream: given a query,
// it (1) plans the question into a handful of sub-queries, (2) searches the
// web per sub-query and gathers raw snippets, (3) synthesizes a final markdown
// report. The whole loop runs in a DETACHED async task in this process — the
// caller gets a jobId back immediately, and the job keeps running even if the
// HTTP response that spawned it closes (mirrors backgroundServe's
// reload-survives pattern; on `next start` the Node process keeps it alive).
//
// The caller (the chat tool, or POST /api/research pulls) polls progress via
// getResearchJob(id): status → queued/running/done/error, a step counter, per-
// step labels, and finally the synthesized `report`.
//
// Testability: the LLM calls and web search are INDEPENDENTLY INJECTABLE
// (deps.llm / deps.search). The default implementations hit the configured
// language model + Tavily, but tests can feed canned responses to drive the
// full plan→search→synthesize loop without a live model or network.
// ═══════════════════════════════════════════════════════════════════════════

import { generateText } from "ai";
import { getLanguageModel } from "@/lib/ai/providers";
import { tavilySearch } from "@/lib/ai/tools/web-search";

export type ResearchStatus = "queued" | "running" | "done" | "error";

export interface ResearchJob {
  id: string;
  query: string;
  modelId: string;
  userId?: string;
  status: ResearchStatus;
  /** Sub-queries completed so far (step/totalSteps is the progress bar). */
  step: number;
  totalSteps: number;
  /** Human labels per sub-query (shown as step checkmarks in the panel). */
  steps: string[];
  report?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/** A single LLM completion → plain text. Injectable for tests. */
export type LLMCall = (
  prompt: string,
  opts?: { system?: string; maxTokens?: number },
) => Promise<string>;

/** A single web search → plain result list. Injectable for tests. */
export type SearchCall = (
  query: string,
) => Promise<Array<{ title: string; url: string; content?: string }>>;

export interface ResearchDeps {
  llm?: LLMCall;
  search?: SearchCall;
  now?: () => number;
}

// ── In-process registry (detached, survives the spawning HTTP response) ──────
const jobs = new Map<string, ResearchJob>();
let counter = 1;
const JOB_PREFIX = "rsch_";

function nextJobId(now: number): string {
  counter = (counter + 1) % 1_000_000_000;
  return `${JOB_PREFIX}${now.toString(36)}_${counter}`;
}

const MAX_SNIPPET = 1200;
const RESULTS_PER_QUERY = 4;
const MAX_SUB_QUERIES = 6;

function defaultSearch(query: string): Promise<Awaited<ReturnType<SearchCall>>> {
  return tavilySearch({ query, withContent: true, maxResults: RESULTS_PER_QUERY }).then((out) =>
    "error" in out
      ? []
      : out.results.map(({ title, url, content }) => ({
          title,
          url,
          content: (content ?? "").slice(0, MAX_SNIPPET),
        })),
  );
}

function defaultLlm(modelId: string): LLMCall {
  return async (prompt, opts) => {
    const { text } = await generateText({
      model: getLanguageModel(modelId),
      prompt,
      system: opts?.system,
      ...(opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
    });
    return text;
  };
}

const PLAN_SYSTEM =
  "You are a research planner. Decompose the user's question into 2-6 " +
  "concrete, independently-searchable sub-queries. Return ONE per line. " +
  "No numbering, no bullets, no preamble.";

const SYNTH_SYSTEM =
  "You are a research analyst. Write a well-structured markdown report " +
  "(with ## section headers) that answers the original question using ONLY " +
  "the provided evidence. Cite sources inline as [title](url). Where the " +
  "evidence is thin, say so explicitly. Do not invent facts.";

/** Parse the planner's line-per-sub-query output into a clean query list. */
export function parsePlan(llmOut: string, fallbackQuery: string): string[] {
  const sqs = llmOut
    .split("\n")
    .map((l) => l.replace(/^[*#>-]*\s*/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  const out = sqs.slice(0, MAX_SUB_QUERIES);
  return out.length ? out : [fallbackQuery];
}

export function createResearchJob(input: {
  id: string;
  query: string;
  modelId: string;
  userId?: string;
  createdAt: number;
}): ResearchJob {
  return { ...input, status: "queued", step: 0, totalSteps: 0, steps: [], updatedAt: input.createdAt };
}

async function runJob(job: ResearchJob, deps: ResearchDeps): Promise<void> {
  const now = deps.now ?? Date.now;
  const llm = deps.llm ?? defaultLlm(job.modelId);
  const search = deps.search ?? defaultSearch;
  const patch = (p: Partial<ResearchJob>) => {
    Object.assign(job, p, { updatedAt: now() });
  };

  try {
    patch({ status: "running", step: 0, totalSteps: 1 });

    // 1. Plan.
    const planRaw = await llm(
      `Research question: ${job.query}\n\nBreak this down into searchable sub-queries.`,
      { system: PLAN_SYSTEM, maxTokens: 400 },
    );
    const subQueries = parsePlan(planRaw, job.query);
    patch({ totalSteps: subQueries.length, steps: subQueries });

    // 2. Gather evidence.
    const evidence: string[] = [];
    for (let i = 0; i < subQueries.length; i++) {
      try {
        const results = await search(subQueries[i]);
        for (const r of results) {
          const body = (r.content ?? "").trim();
          evidence.push(
            `### [${r.title}](${r.url})\n` +
              (body ? body : `(no snippet available for ${r.url})`),
          );
        }
      } catch {
        /* a single failed search step is skipped, never fatal */
      }
      patch({ step: i + 1 });
    }

    if (!evidence.length) {
      patch({
        status: "error",
        error: "No usable web results were returned — try again or rephrase.",
      });
      return;
    }

    // 3. Synthesize → final report (this is the ONLY thing returned to callers).
    // Progress bar already reads step==totalSteps (all sub-queries searched).
    const report = await llm(
      `Original question:\n${job.query}\n\nEvidence collected (truncated per source):\n\n` +
        evidence.join("\n\n"),
      { system: SYNTH_SYSTEM, maxTokens: 3000 },
    );
    patch({ report: report.trim(), status: "done" });
  } catch (err) {
    patch({ status: "error", error: err instanceof Error ? err.message : String(err) });
  }
}

/** Spawn a research job. Returns a jobId immediately; the loop runs detached. */
export function spawnResearch(input: {
  query: string;
  modelId: string;
  userId?: string;
  deps?: ResearchDeps;
}): { id: string } {
  const now = input.deps?.now ?? Date.now;
  const job: ResearchJob = createResearchJob({
    id: nextJobId(now()),
    query: input.query,
    modelId: input.modelId,
    userId: input.userId,
    createdAt: now(),
  });
  jobs.set(job.id, job);
  // Detached: don't await. Never fails the caller if the loop throws.
  void runJob(job, input.deps ?? {}).catch(() => {});
  return { id: job.id };
}

/** Snapshot of a research job (serializable, no closures/emitters). */
export function getResearchJob(id: string): ResearchJob | null {
  const j = jobs.get(id);
  return j ? { ...j } : null;
}

/** Recent jobs, newest first (cap for the panel's "previous runs" list). */
export function listResearchJobs(limit = 10): ResearchJob[] {
  return [...jobs.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((j) => ({ ...j }));
}