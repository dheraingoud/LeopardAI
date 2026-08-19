import { NextRequest } from "next/server";
import { getVideoJob } from "@/lib/video-job-queue";
import { requireGenAccess } from "@/lib/api/guard";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  // Φ-docs · fail-closed access guard (deferred #4): a job is expensive paid
  // work and holds the caller's prompt/deltas, so reads must be ownership-
  // scoped. Accept the signed-in owner, or the internal service token the chat
  // route attaches on server→server fetches. Every other caller is rejected.
  const gate = await requireGenAccess(req);
  if (!gate.ok) return gate.res;

  const { jobId } = await Promise.resolve(context.params);
  const job = await getVideoJob(jobId);
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

  // Ownership: only the job's user (or an internal service caller) may read it.
  // A non-owner gets the same 404 as a missing job so job ids are not probed.
  if (!gate.internal && job.userId && job.userId !== gate.userId) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  return Response.json(job, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
