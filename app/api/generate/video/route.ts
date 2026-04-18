import { NextRequest } from "next/server";
import {
  enqueueVideoJob,
  setVideoJobProcessing,
  completeVideoJob,
  failVideoJob,
} from "@/lib/video-job-queue";

export const runtime = "nodejs";

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const VIDEO_LIMIT_PER_WINDOW = 2;
const WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

const VIDEO_MODEL_MAP: Record<string, string> = {
  "cosmos-reason2-8b": "nvidia/cosmos-reason2-8b",
  "cosmos-transfer2.5-2b": "nvidia/cosmos-transfer2_5-2b",
};

const quotaStore = new Map<string, number[]>();

function parseVideoUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;

  const data = Array.isArray(body.data) ? body.data : null;
  if (data && data.length > 0 && typeof data[0] === "object" && data[0]) {
    const first = data[0] as Record<string, unknown>;
    if (typeof first.url === "string") return first.url;
    if (typeof first.video_url === "string") return first.video_url;
  }

  if (typeof body.video_url === "string") return body.video_url;
  if (typeof body.url === "string") return body.url;

  return null;
}

function consumeQuota(userId: string) {
  const now = Date.now();
  const since = now - WINDOW_MS;
  const existing = (quotaStore.get(userId) || []).filter((t) => t >= since);

  if (existing.length >= VIDEO_LIMIT_PER_WINDOW) {
    return {
      ok: false,
      used: existing.length,
      limit: VIDEO_LIMIT_PER_WINDOW,
    };
  }

  existing.push(now);
  quotaStore.set(userId, existing);
  return {
    ok: true,
    used: existing.length,
    limit: VIDEO_LIMIT_PER_WINDOW,
  };
}

async function processVideoJob(params: {
  jobId: string;
  model: string;
  prompt: string;
  apiKey: string;
}) {
  const { jobId, model, prompt, apiKey } = params;

  try {
    await setVideoJobProcessing(jobId);

    if (model === "nvidia/cosmos-transfer2_5-2b") {
      const videoRes = await fetch(`${NIM_BASE_URL}/video/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
        }),
      });

      const raw = await videoRes.text();
      let payload: unknown = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = { raw };
      }

      if (videoRes.ok) {
        const url = parseVideoUrl(payload);
        if (url) {
          await completeVideoJob(jobId, { kind: "video", url });
          return;
        }
      }

      // Fall through to physics response if video endpoint is unavailable.
    }

    const reasonRes = await fetch(`${NIM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.2,
        max_tokens: 2048,
        messages: [
          {
            role: "system",
            content:
              "You are a physics simulation planner. Return strict JSON with fields scene, camera, objects, motion, constraints, and render_hints.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const reasonRaw = await reasonRes.text();
    let reasonPayload: unknown = null;
    try {
      reasonPayload = reasonRaw ? JSON.parse(reasonRaw) : null;
    } catch {
      reasonPayload = { raw: reasonRaw };
    }

    if (!reasonRes.ok) {
      await failVideoJob(jobId, `Provider error (${reasonRes.status})`);
      return;
    }

    const choices =
      reasonPayload && typeof reasonPayload === "object" && Array.isArray((reasonPayload as Record<string, unknown>).choices)
        ? ((reasonPayload as Record<string, unknown>).choices as Array<Record<string, unknown>>)
        : [];

    const text =
      typeof choices[0]?.message === "object" && choices[0]?.message
        ? ((choices[0].message as Record<string, unknown>).content as string | undefined)
        : undefined;

    await completeVideoJob(jobId, {
      kind: "physics",
      payload: text || "{}",
    });
  } catch (error) {
    console.error("[/api/generate/video] job failed", { jobId, error });
    await failVideoJob(jobId, "Video generation job failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "NVIDIA_API_KEY is not configured" }, { status: 500 });
    }

    const body = (await req.json()) as {
      prompt?: string;
      model?: string;
      userId?: string;
    };

    const prompt = (body.prompt || "").trim();
    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const model = VIDEO_MODEL_MAP[body.model || ""] || VIDEO_MODEL_MAP["cosmos-reason2-8b"];
    const userId = (body.userId || "anonymous").trim();

    const quota = consumeQuota(userId);
    if (!quota.ok) {
      return Response.json(
        {
          error: `Video quota reached (${VIDEO_LIMIT_PER_WINDOW} requests per 15 days).`,
          quota: `${VIDEO_LIMIT_PER_WINDOW}/15 days`,
        },
        { status: 429 },
      );
    }

    const job = await enqueueVideoJob({ prompt, model, userId });
    queueMicrotask(() => {
      void processVideoJob({
        jobId: job.id,
        model,
        prompt,
        apiKey,
      });
    });

    return Response.json({
      ok: true,
      jobId: job.id,
      statusUrl: `/api/video-jobs/${job.id}`,
      usage: {
        used: quota.used,
        limit: quota.limit,
      },
      message: `Video job queued. Track status at /api/video-jobs/${job.id}`,
    });
  } catch (error) {
    console.error("[/api/generate/video] error", error);
    return Response.json({ error: "Failed to queue video generation" }, { status: 500 });
  }
}
