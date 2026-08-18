// Φ-docs · deep-research — poll a detached job's status.
//
// GET /api/research/[jobId] → { id, status, step, totalSteps, steps, report?, error? }
//   404 when the job is unknown (in-memory registry resets on process restart).
//
import { getResearchJob } from "@/lib/ai/research/worker";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = getResearchJob(jobId);
  if (!job) {
    return Response.json({ error: "No such research job." }, { status: 404 });
  }
  return Response.json(job);
}