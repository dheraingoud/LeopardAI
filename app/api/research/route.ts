// Φ-docs · deep-research — spawn a detached research job.
//
// POST /api/research  { query, modelId? } → { id, status }
//   Gated by LEOPARD_DEEP_RESEARCH=1 (off by default → 403). Spawns a detached
//   research loop (lib/ai/research/worker.ts) that runs to completion in the
//   background even if this response closes. Poll GET /api/research/[id].
//
import { getDefaultChatModel, getModelById } from "@/lib/ai/models";
import { spawnResearch, listResearchJobs } from "@/lib/ai/research/worker";

export const runtime = "nodejs";
export const maxDuration = 300;

const ENABLED = process.env.LEOPARD_DEEP_RESEARCH === "1";

/** Recent jobs for the research panel (in-memory registry, newest first). */
export async function GET() {
  if (!ENABLED) {
    return Response.json({ error: "Deep research is disabled." }, { status: 403 });
  }
  return Response.json({ jobs: listResearchJobs(20) });
}

export async function POST(request: Request) {
  if (!ENABLED) {
    return Response.json({ error: "Deep research is disabled." }, { status: 403 });
  }
  let body: { query?: unknown; modelId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) {
    return Response.json({ error: "`query` (non-empty string) is required." }, { status: 400 });
  }
  // Search backend is keyless (DuckDuckGo) since 2026-08-31 — no key check.

  let modelId: string;
  if (typeof body?.modelId === "string" && body.modelId) {
    const m = getModelById(body.modelId);
    modelId = m?.id ?? getDefaultChatModel().id;
  } else {
    modelId = getDefaultChatModel().id;
  }

  const { id } = spawnResearch({ query, modelId });
  return Response.json({ id, status: "queued" });
}