import { NextRequest } from "next/server";
import { getVideoJob } from "@/lib/video-job-queue";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const { jobId } = await Promise.resolve(context.params);
  const job = await getVideoJob(jobId);

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  return Response.json(job, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
