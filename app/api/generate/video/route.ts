import { NextRequest } from "next/server";
import {
  enqueueVideoJob,
  setVideoJobProcessing,
  completeVideoJob,
  failVideoJob,
} from "@/lib/video-job-queue";

export const runtime = "nodejs";

const VIDEO_LIMIT_PER_WINDOW = process.env.NODE_ENV === "development" ? 40 : 2;
const WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
const REASON_TIMEOUT_MS = 120_000;
const TRANSFER_TIMEOUT_MS = 12 * 60 * 1000;
const STATUS_POLL_TIMEOUT_MS = 8 * 60 * 1000;
const STATUS_POLL_INTERVAL_MS = 8_000;

const VIDEO_MODEL_MAP: Record<string, string> = {
  "cosmos-reason2-8b": "nvidia/cosmos-reason2-8b",
  "nvidia/cosmos-reason2-8b": "nvidia/cosmos-reason2-8b",
  "cosmos-transfer2.5-2b": "nvidia/cosmos-transfer2_5-2b",
  "cosmos-transfer2_5-2b": "nvidia/cosmos-transfer2_5-2b",
  "nvidia/cosmos-transfer2_5-2b": "nvidia/cosmos-transfer2_5-2b",
};

const VIDEO_URL_KEYS = new Set([
  "video_url",
  "url",
  "output_video",
  "output_video_url",
  "output_url",
  "download_url",
  "asset_url",
  "file_url",
  "stream_url",
  "result_url",
  "video",
]);

const VIDEO_BASE64_KEYS = new Set([
  "b64_video",
  "base64_video",
  "video_base64",
  "b64",
  "base64",
]);

const STATUS_URL_KEYS = new Set([
  "status_url",
  "statusurl",
  "poll_url",
  "pollurl",
  "result_url",
  "resulturl",
  "operation_url",
  "operationurl",
]);

const TERMINAL_PROVIDER_STATES = new Set(["failed", "error", "cancelled", "canceled"]);

type ProviderAttempt = {
  endpoint: string;
  status: number;
};

type TransferGenerationResult = {
  ok: true;
  url: string;
  status: number;
  payload: unknown;
  attempts: ProviderAttempt[];
  endpoint: string;
};

type TransferGenerationFailure = {
  ok: false;
  status: number;
  payload: unknown;
  attempts: ProviderAttempt[];
};

type ReasoningResult = {
  ok: true;
  text: string;
  status: number;
  payload: unknown;
  attempts: ProviderAttempt[];
  endpoint: string;
  usedModel: string;
};

type ReasoningFailure = {
  ok: false;
  status: number;
  payload: unknown;
  attempts: ProviderAttempt[];
};

type ControlSignalKey = "edge" | "depth" | "seg" | "segmentation" | "blur";

type ProviderPollResult = {
  ok: boolean;
  status: number;
  payload: unknown;
  url?: string;
};

interface TransferParams {
  apiKey: string;
  prompt: string;
  sourceVideoUrl: string;
  negativePrompt?: string;
  resolution?: string;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  controlSignals?: unknown;
}

interface ReasonParams {
  apiKey: string;
  prompt: string;
  sourceVideoUrl: string;
  question?: string;
  fps?: number;
  maxTokens?: number;
  followup?: string;
}

const quotaStore = new Map<string, number[]>();

const baseHeaders = (apiKey: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${apiKey}`,
  Accept: "application/json",
});

function looksLikeBase64(value: string): boolean {
  const candidate = value.trim();
  if (candidate.length < 120) return false;
  if (/^https?:\/\//i.test(candidate)) return false;
  if (/^data:/i.test(candidate)) return false;
  return /^[A-Za-z0-9+/=\r\n]+$/.test(candidate);
}

function normalizeMediaInput(value: string): string {
  const trimmed = value.trim();
  const dataPrefix = /^data:[^;]+;base64,/i;
  if (dataPrefix.test(trimmed)) {
    return trimmed.replace(dataPrefix, "");
  }
  return trimmed;
}

function toVideoDataUrl(base64Payload: string): string {
  if (/^data:video\//i.test(base64Payload)) {
    return base64Payload;
  }
  return `data:video/mp4;base64,${normalizeMediaInput(base64Payload)}`;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return { raw };
  }
}

function findStringInPayload(
  payload: unknown,
  predicate: (key: string, value: string) => boolean,
): string | null {
  const queue: Array<{ key: string; value: unknown }> = [{ key: "", value: payload }];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const { key, value } = current;

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && predicate(key.toLowerCase(), trimmed)) {
        return trimmed;
      }
      continue;
    }

    if (!value || typeof value !== "object" || visited.has(value)) continue;

    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        queue.push({ key, value: item });
      }
      continue;
    }

    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      queue.push({ key: entryKey, value: entryValue });
    }
  }

  return null;
}

function parseVideoUrl(payload: unknown): string | null {
  return findStringInPayload(payload, (key, value) => {
    const isUrlLike = /^https?:\/\//i.test(value) || /^data:video\//i.test(value) || /^blob:/i.test(value);
    if (!isUrlLike) return false;
    if (VIDEO_URL_KEYS.has(key)) return true;
    return key.endsWith("url") && /(video|mp4|mov|webm|m3u8|stream|asset|download|file)/i.test(`${key}:${value}`);
  });
}

function parseVideoBase64(payload: unknown): string | null {
  const keyed = findStringInPayload(
    payload,
    (key, value) => VIDEO_BASE64_KEYS.has(key) && (looksLikeBase64(value) || /^data:video\//i.test(value)),
  );
  if (keyed) return keyed;

  return findStringInPayload(payload, (key, value) => {
    if (key !== "video") return false;
    return looksLikeBase64(value) || /^data:video\//i.test(value);
  });
}

function parseVideoOutput(payload: unknown): string | null {
  const directUrl = parseVideoUrl(payload);
  if (directUrl) return directUrl;

  const base64 = parseVideoBase64(payload);
  if (base64) return toVideoDataUrl(base64);

  return null;
}

function parseStatusUrl(payload: unknown, fallbackEndpoint: string): string | null {
  const candidate = findStringInPayload(payload, (key, value) => {
    if (!STATUS_URL_KEYS.has(key) && !key.endsWith("status_url") && !key.endsWith("poll_url")) {
      return false;
    }
    return /^https?:\/\//i.test(value) || value.startsWith("/");
  });

  if (!candidate) return null;
  if (/^https?:\/\//i.test(candidate)) return candidate;

  if (candidate.startsWith("/")) {
    try {
      return new URL(candidate, fallbackEndpoint).toString();
    } catch {
      return null;
    }
  }

  return null;
}

function extractProviderState(payload: unknown): string | null {
  const state = findStringInPayload(payload, (key, value) => {
    if (key !== "status" && key !== "state") return false;
    return value.length < 64;
  });

  return state ? state.toLowerCase() : null;
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;

  const fields = ["error", "message", "detail", "details", "reason"];
  for (const field of fields) {
    const value = body[field];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const nested = extractErrorMessage(value);
      if (nested) return nested;
    }
  }

  return null;
}

function extractCompletionText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;

  const directTextFields = ["output_text", "response", "result", "analysis"];
  for (const field of directTextFields) {
    const value = body[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const choices = Array.isArray(body.choices) ? (body.choices as Array<Record<string, unknown>>) : [];
  const first = choices[0];
  const message = first?.message;

  if (message && typeof message === "object") {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }

    if (Array.isArray(content)) {
      const joined = content
        .map((entry) => {
          if (typeof entry === "string") return entry;
          if (entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).text === "string") {
            return ((entry as Record<string, unknown>).text as string) || "";
          }
          return "";
        })
        .join("\n")
        .trim();

      if (joined) {
        return joined;
      }
    }
  }

  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function clampFloat(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function mapResolutionPreset(resolution?: string): { width: number; height: number; token: "480" | "720" } {
  if (resolution === "720" || resolution === "720p") {
    return { width: 1280, height: 704, token: "720" };
  }
  return { width: 854, height: 480, token: "480" };
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);
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

async function pollProviderForVideoOutput(statusUrl: string, apiKey: string): Promise<ProviderPollResult> {
  const startedAt = Date.now();
  let activeStatusUrl = statusUrl;
  let lastStatus = 202;
  let lastPayload: unknown = null;

  while (Date.now() - startedAt < STATUS_POLL_TIMEOUT_MS) {
    let response: Response;
    try {
      response = await fetch(activeStatusUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REASON_TIMEOUT_MS),
      });
    } catch (error) {
      return {
        ok: false,
        status: 599,
        payload: {
          error: error instanceof Error ? error.message : "Polling request failed",
        },
      };
    }

    const payload = await parseJsonResponse(response);
    lastStatus = response.status;
    lastPayload = payload;

    if (response.ok) {
      const resolvedVideoUrl = parseVideoOutput(payload);
      if (resolvedVideoUrl) {
        return {
          ok: true,
          status: response.status,
          payload,
          url: resolvedVideoUrl,
        };
      }

      const providerState = extractProviderState(payload);
      if (providerState && TERMINAL_PROVIDER_STATES.has(providerState)) {
        return {
          ok: false,
          status: 502,
          payload,
        };
      }

      const nextStatusUrl = parseStatusUrl(payload, activeStatusUrl);
      if (nextStatusUrl) {
        activeStatusUrl = nextStatusUrl;
      }
    } else {
      return {
        ok: false,
        status: response.status,
        payload,
      };
    }

    await sleep(STATUS_POLL_INTERVAL_MS);
  }

  return {
    ok: false,
    status: lastStatus || 408,
    payload: lastPayload || { error: "Timed out waiting for provider status" },
  };
}

function extractControlSignal(controlSignals: unknown, key: ControlSignalKey) {
  if (!controlSignals || typeof controlSignals !== "object") return null;

  const signals = controlSignals as Record<string, unknown>;
  const entry = key === "segmentation" ? signals.segmentation ?? signals.seg : signals[key];
  if (!entry || typeof entry !== "object") return null;

  const parsed = entry as Record<string, unknown>;
  const enabled = parsed.enabled === undefined ? true : Boolean(parsed.enabled);
  if (!enabled) return null;

  const controlCandidate = [parsed.control, parsed.url, parsed.controlUrl, parsed.video, parsed.value]
    .find((value) => typeof value === "string" && value.trim().length > 0) as string | undefined;

  if (!controlCandidate) return null;

  const controlWeight = clampFloat(parsed.weight ?? parsed.control_weight, 0.5, 0, 1);

  return {
    control_weight: controlWeight,
    control: normalizeMediaInput(controlCandidate),
  };
}

async function generateTransferVideo(params: TransferParams): Promise<TransferGenerationResult | TransferGenerationFailure> {
  const {
    apiKey,
    prompt,
    sourceVideoUrl,
    negativePrompt,
    resolution,
    steps,
    cfgScale,
    seed,
    controlSignals,
  } = params;

  const sourceVideo = sourceVideoUrl.trim();
  if (!sourceVideo) {
    return {
      ok: false,
      status: 400,
      payload: { error: "sourceVideoUrl is required for Cosmos Transfer2.5." },
      attempts: [],
    };
  }

  const resolutionPreset = mapResolutionPreset(resolution);

  const transferPayload: Record<string, unknown> = {
    prompt,
    video: normalizeMediaInput(sourceVideo),
    resolution: resolutionPreset.token,
    seed: clampNumber(seed, 42, 0, 2_147_483_647),
    guidance_scale: clampFloat(cfgScale, 7.5, 0.1, 30),
    steps: clampNumber(steps, 35, 1, 80),
    video_params: {
      height: resolutionPreset.height,
      width: resolutionPreset.width,
      frames_count: 121,
      frames_per_sec: 24,
    },
  };

  if (negativePrompt?.trim()) {
    transferPayload.negative_prompt = negativePrompt.trim();
  }

  const edgeControl = extractControlSignal(controlSignals, "edge");
  const depthControl = extractControlSignal(controlSignals, "depth");
  const segmentationControl = extractControlSignal(controlSignals, "segmentation");
  const blurControl = extractControlSignal(controlSignals, "blur");

  if (edgeControl) transferPayload.edge = edgeControl;
  if (depthControl) transferPayload.depth = depthControl;
  if (segmentationControl) transferPayload.segmentation = segmentationControl;
  if (blurControl) transferPayload.blur = blurControl;

  const endpointCandidates = uniqueStrings([
    "https://ai.api.nvidia.com/v1/genai/nvidia/cosmos-transfer2_5-2b",
    "https://ai.api.nvidia.com/v1/genai/nvidia/cosmos-transfer2.5-2b",
    "https://ai.api.nvidia.com/v1/cosmos/nvidia/cosmos-transfer2_5-2b/infer",
    "https://ai.api.nvidia.com/v1/cosmos/nvidia/cosmos-transfer2.5-2b/infer",
    "https://integrate.api.nvidia.com/v1/genai/nvidia/cosmos-transfer2_5-2b",
    "https://integrate.api.nvidia.com/v1/cosmos/nvidia/cosmos-transfer2_5-2b/infer",
  ]);

  const attempts: ProviderAttempt[] = [];
  let lastStatus = 500;
  let lastPayload: unknown = null;

  for (const endpoint of endpointCandidates) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: baseHeaders(apiKey),
        body: JSON.stringify(transferPayload),
        signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
      });
    } catch (error) {
      attempts.push({ endpoint, status: 599 });
      lastStatus = 599;
      lastPayload = {
        error: error instanceof Error ? error.message : "Transfer request failed",
      };
      continue;
    }

    const payload = await parseJsonResponse(response);
    attempts.push({ endpoint, status: response.status });
    lastStatus = response.status;
    lastPayload = payload;

    if (response.ok) {
      const resolvedVideoUrl = parseVideoOutput(payload);
      if (resolvedVideoUrl) {
        return {
          ok: true,
          url: resolvedVideoUrl,
          status: response.status,
          payload,
          attempts,
          endpoint,
        };
      }

      const statusUrl = parseStatusUrl(payload, endpoint);
      if (statusUrl) {
        const polled = await pollProviderForVideoOutput(statusUrl, apiKey);
        if (polled.ok && polled.url) {
          return {
            ok: true,
            url: polled.url,
            status: polled.status,
            payload: polled.payload,
            attempts,
            endpoint,
          };
        }

        lastStatus = polled.status;
        lastPayload = polled.payload;
      }
    }

    if (response.status === 202) {
      const statusUrl = parseStatusUrl(payload, endpoint);
      if (statusUrl) {
        const polled = await pollProviderForVideoOutput(statusUrl, apiKey);
        if (polled.ok && polled.url) {
          return {
            ok: true,
            url: polled.url,
            status: polled.status,
            payload: polled.payload,
            attempts,
            endpoint,
          };
        }

        lastStatus = polled.status;
        lastPayload = polled.payload;
      }
    }

    if (response.status === 401 || response.status === 403) {
      break;
    }
  }

  return {
    ok: false,
    status: lastStatus,
    payload: lastPayload,
    attempts,
  };
}

async function runReasoningRequest(params: ReasonParams): Promise<ReasoningResult | ReasoningFailure> {
  const { apiKey, prompt, sourceVideoUrl, question, fps, maxTokens, followup } = params;

  const sourceVideo = sourceVideoUrl.trim();
  if (!sourceVideo) {
    return {
      ok: false,
      status: 400,
      payload: { error: "sourceVideoUrl is required for Cosmos Reason2." },
      attempts: [],
    };
  }

  const normalizedSource = normalizeMediaInput(sourceVideo);
  const reasonPrompt = [question?.trim(), followup?.trim(), prompt.trim()].filter(Boolean).join("\n\n");

  const reasonMessages = [
    {
      role: "system",
      content:
        "You are a physical AI assistant that reasons carefully about spatial relationships, motion, and physical plausibility.",
    },
    {
      role: "user",
      content: [
        {
          type: "video_url",
          video_url: {
            url: normalizedSource,
          },
        },
        {
          type: "text",
          text: reasonPrompt,
        },
      ],
    },
  ];

  const baseReasonPayload = {
    model: "nvidia/cosmos-reason2-8b",
    messages: reasonMessages,
    max_tokens: clampNumber(maxTokens, 2048, 256, 4096),
    temperature: 0.3,
    top_p: 0.3,
    stream: false,
    extra_body: {
      media_io_kwargs: {
        fps: clampNumber(fps, 2, 1, 8),
      },
    },
  };

  const attempts: ProviderAttempt[] = [];
  let lastStatus = 500;
  let lastPayload: unknown = null;

  const vlmEndpoints = [
    "https://ai.api.nvidia.com/v1/vlm/nvidia/cosmos-reason2-8b",
    "https://integrate.api.nvidia.com/v1/vlm/nvidia/cosmos-reason2-8b",
  ];

  for (const endpoint of vlmEndpoints) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: baseHeaders(apiKey),
        body: JSON.stringify(baseReasonPayload),
        signal: AbortSignal.timeout(REASON_TIMEOUT_MS),
      });
    } catch (error) {
      attempts.push({ endpoint, status: 599 });
      lastStatus = 599;
      lastPayload = {
        error: error instanceof Error ? error.message : "Reasoning request failed",
      };
      continue;
    }

    const payload = await parseJsonResponse(response);
    attempts.push({ endpoint, status: response.status });
    lastStatus = response.status;
    lastPayload = payload;

    if (response.ok) {
      const text = extractCompletionText(payload);
      if (text) {
        return {
          ok: true,
          text,
          status: response.status,
          payload,
          attempts,
          endpoint,
          usedModel: "nvidia/cosmos-reason2-8b",
        };
      }
    }

    if (response.status === 401 || response.status === 403) {
      break;
    }
  }

  const chatEndpoints = [
    "https://ai.api.nvidia.com/v1/chat/completions",
    "https://integrate.api.nvidia.com/v1/chat/completions",
  ];
  const modelCandidates = uniqueStrings(["nvidia/cosmos-reason2-8b", "cosmos-reason2-8b"]);

  for (const endpoint of chatEndpoints) {
    for (const candidateModel of modelCandidates) {
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: baseHeaders(apiKey),
          body: JSON.stringify({
            ...baseReasonPayload,
            model: candidateModel,
          }),
          signal: AbortSignal.timeout(REASON_TIMEOUT_MS),
        });
      } catch (error) {
        attempts.push({ endpoint: `${endpoint}#${candidateModel}`, status: 599 });
        lastStatus = 599;
        lastPayload = {
          error: error instanceof Error ? error.message : "OpenAI-compatible reasoning request failed",
        };
        continue;
      }

      const payload = await parseJsonResponse(response);
      attempts.push({ endpoint: `${endpoint}#${candidateModel}`, status: response.status });
      lastStatus = response.status;
      lastPayload = payload;

      if (response.ok) {
        const text = extractCompletionText(payload);
        if (text) {
          return {
            ok: true,
            text,
            status: response.status,
            payload,
            attempts,
            endpoint,
            usedModel: candidateModel,
          };
        }
      }

      if (response.status === 401 || response.status === 403) {
        break;
      }
    }
  }

  return {
    ok: false,
    status: lastStatus,
    payload: lastPayload,
    attempts,
  };
}

function normalizeModelKey(value: string) {
  try {
    return decodeURIComponent(value).trim().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function resolveVideoModel(modelInput?: string): string {
  const normalized = normalizeModelKey(modelInput || "cosmos-reason2-8b");
  return VIDEO_MODEL_MAP[normalized] || VIDEO_MODEL_MAP["cosmos-reason2-8b"];
}

async function processVideoJob(params: {
  jobId: string;
  model: string;
  prompt: string;
  apiKey: string;
  sourceVideoUrl?: string;
  negativePrompt?: string;
  resolution?: string;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  controlSignals?: unknown;
  question?: string;
  fps?: number;
  maxTokens?: number;
  followup?: string;
}) {
  const {
    jobId,
    model,
    prompt,
    apiKey,
    sourceVideoUrl,
    negativePrompt,
    resolution,
    steps,
    cfgScale,
    seed,
    controlSignals,
    question,
    fps,
    maxTokens,
    followup,
  } = params;

  try {
    await setVideoJobProcessing(jobId);

    if (model === "nvidia/cosmos-transfer2_5-2b") {
      const transfer = await generateTransferVideo({
        apiKey,
        prompt,
        sourceVideoUrl: sourceVideoUrl || "",
        negativePrompt,
        resolution,
        steps,
        cfgScale,
        seed,
        controlSignals,
      });

      if (!transfer.ok) {
        const providerMessage = extractErrorMessage(transfer.payload);
        await failVideoJob(
          jobId,
          providerMessage
            ? `Video provider error (${transfer.status}): ${providerMessage}`
            : `Video provider error (${transfer.status})`,
        );
        return;
      }

      await completeVideoJob(jobId, { kind: "video", url: transfer.url });
      return;
    }

    const reasoning = await runReasoningRequest({
      apiKey,
      prompt,
      sourceVideoUrl: sourceVideoUrl || "",
      question,
      fps,
      maxTokens,
      followup,
    });

    if (!reasoning.ok) {
      const providerMessage = extractErrorMessage(reasoning.payload);
      await failVideoJob(
        jobId,
        providerMessage
          ? `Provider error (${reasoning.status}): ${providerMessage}`
          : `Provider error (${reasoning.status})`,
      );
      return;
    }

    await completeVideoJob(jobId, {
      kind: "physics",
      payload:
        reasoning.usedModel !== "nvidia/cosmos-reason2-8b"
          ? `[fallback-model:${reasoning.usedModel}]\n${reasoning.text}`
          : reasoning.text,
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
      sourceVideoUrl?: string;
      negativePrompt?: string;
      resolution?: string;
      steps?: number;
      cfgScale?: number;
      seed?: number;
      controlSignals?: unknown;
      question?: string;
      fps?: number;
      maxTokens?: number;
      followup?: string;
    };

    const prompt = (body.prompt || "").trim();
    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const model = resolveVideoModel(body.model);
    const sourceVideoUrl = (body.sourceVideoUrl || "").trim();
    const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userId = (body.userId || forwardedFor || "anonymous").trim();

    if (!sourceVideoUrl) {
      return Response.json(
        {
          error:
            model === "nvidia/cosmos-transfer2_5-2b"
              ? "Source video URL or base64 payload is required for Cosmos Transfer2.5."
              : "Source video URL or base64 payload is required for Cosmos Reason2.",
        },
        { status: 400 },
      );
    }

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
        sourceVideoUrl,
        negativePrompt: body.negativePrompt,
        resolution: body.resolution,
        steps: body.steps,
        cfgScale: body.cfgScale,
        seed: body.seed,
        controlSignals: body.controlSignals,
        question: body.question,
        fps: body.fps,
        maxTokens: body.maxTokens,
        followup: body.followup,
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
