import { NextRequest } from "next/server";
import { NIM_BASE } from "@/lib/nim";
import { requireGenAccess } from "@/lib/api/guard";

export const runtime = "nodejs";

// NVIDIA image models are hosted behind GenAI endpoints on ai.api.nvidia.com.
const GENAI_BASE_URLS = [
  "https://ai.api.nvidia.com/v1/genai",
  "https://integrate.api.nvidia.com/v1/genai",
];
// qwen-image + qwen-image-edit use NIM's native `/infer` namespace — the
// older `/v1/genai/<provider>/<model>` shape is NOT used by these. Path shape:
//   /v1/qwen/<model>/infer
// Body shape (text-to-image):
//   { "prompt": "…", "seed": 0, "image_size": "1024x1024" }
// Body shape (edit):
//   { "prompt": "…", "seed": 0, "image": "data:image/jpeg;base64,…" }
// Response:
//   { "artifacts": [{ "base64": "…", "seed": 0, … }] }
// Field name is `base64` (lowercase, all ASCII — confirmed against the live
// endpoint 2026-07-11). Resolve into a `data:image/jpeg;base64,…` URL the
// client can hand straight to the markdown-image renderer / image-cache
// sanitizer.
const NIM_INFER_BASE = "https://ai.api.nvidia.com/v1";
const QWEN_INFER_TIMEOUT_MS = 90_000;
const IMAGE_LIMIT_PER_DAY = process.env.NODE_ENV === "development" ? 200 : 5;
const PROVIDER_TIMEOUT_MS = 60_000;

function isQwenInferModel(modelId: string): boolean {
  return (
    modelId.startsWith("qwen/qwen-image") || modelId.startsWith("qwen-image")
  );
}

interface ImageModelConfig {
  nimModel: string;
  nimFallbackModels?: string[];
  genaiPaths: string[];
  fallbackModelId?: string;
  fallbackReason?: string;
}

interface GenAiAttempt {
  modelId: string;
  baseUrl: string;
  path: string;
  status: number;
}

const IMAGE_MODEL_CONFIGS: Record<string, ImageModelConfig> = {
  "sd-3.5-large": {
    nimModel: "stabilityai/stable-diffusion-3_5-large",
    nimFallbackModels: [
      "stabilityai/stable-diffusion-3.5-large",
      "stable-diffusion-3_5-large",
      "stable-diffusion-3.5-large",
    ],
    genaiPaths: [
      "stabilityai/stable-diffusion-3_5-large",
      "stabilityai/stable-diffusion-3.5-large",
      "stable-diffusion-3.5-large",
      "stable-diffusion-3_5-large",
    ],
    // SD3.5 is not always enabled on free-tier routes. Use SDXL explicitly when unavailable.
    fallbackModelId: "stable-diffusion-xl-base",
    fallbackReason: "Requested SD 3.5 endpoint unavailable; using SDXL fallback.",
  },
  "flux-2-klein-4b": {
    nimModel: "black-forest-labs/flux.2-klein-4b",
    nimFallbackModels: [
      "black-forest-labs/flux.2-klein-4b",
      "black-forest-labs/flux_2-klein-4b",
      "black-forest-labs/flux_2-klein_4b",
      "black-forest-labs/flux_1-dev",
      "black-forest-labs/flux.1-dev",
    ],
    genaiPaths: [
      "black-forest-labs/flux.2-klein-4b",
      "black-forest-labs/flux_2-klein_4b",
      "black-forest-labs/flux_2-klein-4b",
      "black-forest-labs/flux_1-dev",
      "black-forest-labs/flux.1-dev",
    ],
  },
  "stable-diffusion-xl-base": {
    nimModel: "stabilityai/sdxl",
    nimFallbackModels: [
      "stabilityai/sdxl",
      "stabilityai/stable-diffusion-xl",
      "stabilityai/stable-diffusion-xl-1.0",
      "stabilityai/stable-diffusion-xl-base-1.0",
    ],
    genaiPaths: [
      "stabilityai/sdxl",
      "stabilityai/stable-diffusion-xl",
      "stabilityai/stable-diffusion-xl-base-1.0",
      "stabilityai/stable-diffusion-xl-1.0",
    ],
  },
  // Φ9 qwen-image + qwen-image-edit. These use NIM's native /infer namespace,
  // NOT the /v1/genai shape (see `isQwenInferModel` + the infer branch at the
  // top of POST). Model IDs follow NVIDIA's "qwen/qwen-image-2512"+ convention.
  "qwen-image": {
    nimModel: "qwen/qwen-image",
    nimFallbackModels: ["qwen/qwen-image-2512"],
    // The infer branch reads `nimModel` directly, but we keep an entry in
    // genaiPaths so the legacy fallback doesn't choke on an unknown key.
    genaiPaths: ["qwen/qwen-image", "qwen/qwen-image-2512"],
  },
  "qwen-image-edit": {
    nimModel: "qwen/qwen-image-edit",
    nimFallbackModels: ["qwen/qwen-image-edit-2511"],
    genaiPaths: ["qwen/qwen-image-edit", "qwen/qwen-image-edit-2511"],
  },
};

type ImageModelId = keyof typeof IMAGE_MODEL_CONFIGS;

const IMAGE_MODEL_ALIASES: Record<string, ImageModelId> = {
  "sd-3.5-large": "sd-3.5-large",
  "stable-diffusion-3.5-large": "sd-3.5-large",
  "stable-diffusion-3_5-large": "sd-3.5-large",
  "stabilityai/stable-diffusion-3.5-large": "sd-3.5-large",
  "stabilityai/stable-diffusion-3_5-large": "sd-3.5-large",
  "sd35": "sd-3.5-large",
  "flux-2-klein-4b": "flux-2-klein-4b",
  "flux.2-klein-4b": "flux-2-klein-4b",
  "flux_2-klein-4b": "flux-2-klein-4b",
  "flux_2-klein_4b": "flux-2-klein-4b",
  "flux_2-klein": "flux-2-klein-4b",
  "flux-2-klien-4b": "flux-2-klein-4b",
  "black-forest-labs/flux.2-klein-4b": "flux-2-klein-4b",
  "black-forest-labs/flux_2-klein-4b": "flux-2-klein-4b",
  "black-forest-labs/flux_2-klein_4b": "flux-2-klein-4b",
  "black-forest-labs/flux_2-klein": "flux-2-klein-4b",
  "black-forest-labs/flux-2-klein-4b": "flux-2-klein-4b",
  "black-forest-labs/flux_1-dev": "flux-2-klein-4b",
  "black-forest-labs/flux.1-dev": "flux-2-klein-4b",
  "stable-diffusion-xl-base": "stable-diffusion-xl-base",
  sdxl: "stable-diffusion-xl-base",
  "stabilityai/sdxl": "stable-diffusion-xl-base",
  "stabilityai/stable-diffusion-xl": "stable-diffusion-xl-base",
  "stabilityai/stable-diffusion-xl-base-1.0": "stable-diffusion-xl-base",
  "stabilityai/stable-diffusion-xl-1.0": "stable-diffusion-xl-base",
  // qwen-image + qwen-image-edit (Φ9 — NVIDIA NIM native /infer namespace).
  "qwen-image": "qwen-image",
  "qwen-image-2512": "qwen-image",
  "qwen/qwen-image": "qwen-image",
  "qwen/qwen-image-2512": "qwen-image",
  "qwen-image-edit": "qwen-image-edit",
  "qwen-image-edit-2511": "qwen-image-edit",
  "qwen/qwen-image-edit": "qwen-image-edit",
  "qwen/qwen-image-edit-2511": "qwen-image-edit",
};

const quotaStore = new Map<string, number>();

function getQuotaKey(userId: string, day: string) {
  return `${userId}:${day}`;
}

function getDayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeModelKey(value: string) {
  try {
    return decodeURIComponent(value).trim().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function resolveModelConfig(modelInput?: string): { modelId: ImageModelId; config: ImageModelConfig } {
  const normalized = normalizeModelKey(modelInput || "sd-3.5-large");
  const modelId = IMAGE_MODEL_ALIASES[normalized] || "sd-3.5-large";
  return {
    modelId,
    config: IMAGE_MODEL_CONFIGS[modelId],
  };
}

// Φ9 — qwen-image + qwen-image-edit fast path. Hits NIM's native /infer
// namespace with the simple {prompt, seed, image_size | image} body shape
// (validated 2026-07-11 against the live endpoint). Response is
// {artifacts:[{base64, seed, …}]} which we resolve to a data:image/jpeg URL
// the existing client image-cache sanitizer (lib/image-cache) handles.
async function handleQwenInfer(args: {
  prompt: string;
  modelId: "qwen-image" | "qwen-image-edit";
  width: number;
  height: number;
  seed: number;
  editImage?: string;
  apiKey: string;
}): Promise<{ url: string } | { error: string; status: number }> {
  const isEdit = args.modelId === "qwen-image-edit";
  const inferModel = isEdit ? "qwen-image-edit" : "qwen-image";
  const url = `${NIM_INFER_BASE}/qwen/${inferModel}/infer`;

  const body: Record<string, unknown> = {
    prompt: args.prompt,
    seed: args.seed,
    image_size: `${args.width}x${args.height}`,
  };
  if (isEdit) {
    if (!args.editImage) {
      return { error: "editImage is required for qwen-image-edit", status: 400 };
    }
    body.image = args.editImage.startsWith("data:")
      ? args.editImage
      : `data:image/jpeg;base64,${args.editImage}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(QWEN_INFER_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      error: `qwen-infer network error: ${err instanceof Error ? err.message : "unknown"}`,
      status: 502,
    };
  }

  const raw = await res.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = { raw };
  }
  if (!res.ok) {
    const errorMsg = (parsed as { error?: { message?: string } })?.error?.message || `qwen-infer ${res.status}`;
    return { error: errorMsg, status: res.status };
  }

  // `base64` (lowercase) per live endpoint schema. Accept `b64` for safety.
  const artifacts = (parsed as { artifacts?: Array<Record<string, unknown>> })?.artifacts || [];
  const first = artifacts[0] || {};
  const b64 =
    (typeof first.base64 === "string" && first.base64) ||
    (typeof first.b64 === "string" && first.b64) ||
    (typeof (parsed as { image?: string })?.image === "string" && (parsed as { image?: string }).image) ||
    "";
  if (!b64) {
    return { error: "qwen-infer returned no image", status: 502 };
  }
  return { url: `data:image/jpeg;base64,${b64}` };
}

function toClampedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function toImageUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  if (/^data:image\//i.test(value)) return value;
  return `data:image/png;base64,${value}`;
}

function extractStringCandidate(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = extractStringCandidate(entry);
      if (candidate) return candidate;
    }
  }

  return null;
}

function resolveImageUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;

  const directStringKeys = [
    "image_url",
    "imageUrl",
    "url",
    "image",
    "b64_json",
    "base64",
    "image_base64",
    "b64",
    "jpeg",
    "png",
  ];
  for (const key of directStringKeys) {
    const value = extractStringCandidate(body[key]);
    if (value) {
      return toImageUrl(value);
    }
  }

  const candidates: unknown[] = [];
  if (Array.isArray(body.data)) candidates.push(...body.data);
  if (Array.isArray(body.output)) candidates.push(...body.output);
  if (Array.isArray(body.images)) candidates.push(...body.images);
  if (Array.isArray(body.artifacts)) candidates.push(...body.artifacts);

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const entry = candidate as Record<string, unknown>;
    for (const key of directStringKeys) {
      const value = extractStringCandidate(entry[key]);
      if (value) {
        return toImageUrl(value);
      }
    }
  }

  return null;
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  return values
    .map((value) => (value || "").trim())
    .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
}

function normalizeFluxCfgScale(value?: number): number | undefined {
  if (!Number.isFinite(Number(value))) return undefined;
  const parsed = Number(value);
  const normalized = parsed > 1 ? parsed / 10 : parsed;
  return Math.max(0.05, Math.min(1, normalized));
}

function getModelDimensions(modelId: ImageModelId, width: number, height: number) {
  if (modelId === "stable-diffusion-xl-base") {
    return { width: 1024, height: 1024 };
  }

  return { width, height };
}

function buildGenAiPayloadVariants(input: {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed: number;
  steps: number;
  cfgScale?: number;
  stylePreset?: string;
  mode?: string;
  initImage?: string;
  imageStrength?: number;
  editImage?: string;
  mask?: string;
  modelId: string;
}): Array<Record<string, unknown>> {
  const {
    prompt,
    negativePrompt,
    width,
    height,
    seed,
    steps,
    cfgScale,
    stylePreset,
    mode,
    initImage,
    imageStrength,
    editImage,
    mask,
    modelId,
  } = input;

  const isFlux = modelId === "flux-2-klein-4b";
  const fluxEditing = Boolean(editImage || initImage || mask || mode === "edit-inpaint");
  const fluxMode = fluxEditing ? "Image Editing" : undefined;

  const basePayload: Record<string, unknown> = {
    prompt,
    width,
    height,
    seed,
    steps,
  };

  const detailedPayload: Record<string, unknown> = {
    ...basePayload,
    negative_prompt: negativePrompt || undefined,
    cfg_scale: cfgScale,
    style_preset: stylePreset,
    mode,
  };

  if (initImage) {
    detailedPayload.init_image = initImage;
    detailedPayload.image_strength = imageStrength;
  }

  if (editImage) {
    detailedPayload.image = editImage;
  }

  if (mask) {
    detailedPayload.mask = mask;
  }

  if (modelId === "stable-diffusion-xl-base") {
    detailedPayload.text_prompts = [
      { text: prompt, weight: 1 },
      ...(negativePrompt ? [{ text: negativePrompt, weight: -1 }] : []),
    ];
    detailedPayload.cfg_scale = cfgScale ?? 7;
    detailedPayload.samples = 1;
    delete detailedPayload.prompt;
    delete detailedPayload.mode;
  }

  if (isFlux) {
    if (fluxMode) {
      detailedPayload.mode = fluxMode;
    } else {
      delete detailedPayload.mode;
    }

    const fluxImage = editImage || initImage;
    if (fluxImage) {
      detailedPayload.image = fluxImage;
      delete detailedPayload.init_image;
      delete detailedPayload.image_strength;
    }

    if (mask) {
      detailedPayload.mask = mask;
    }

    detailedPayload.steps = steps;
    const normalizedFluxCfg = normalizeFluxCfgScale(cfgScale);
    if (normalizedFluxCfg !== undefined) {
      detailedPayload.cfg_scale = Number(normalizedFluxCfg.toFixed(2));
    } else {
      delete detailedPayload.cfg_scale;
    }
  }

  const minimalPayload: Record<string, unknown> = {
    ...basePayload,
    mode: isFlux ? fluxMode : mode,
  };

  if (!minimalPayload.mode) {
    delete minimalPayload.mode;
  }

  if (isFlux) {
    minimalPayload.steps = steps;
    const normalizedFluxCfg = normalizeFluxCfgScale(cfgScale);
    if (normalizedFluxCfg !== undefined) {
      minimalPayload.cfg_scale = Number(normalizedFluxCfg.toFixed(2));
    } else {
      delete minimalPayload.cfg_scale;
    }
  }

  if (isFlux && (editImage || initImage)) {
    minimalPayload.image = editImage || initImage;
  }

  if (isFlux && mask) {
    minimalPayload.mask = mask;
  }

  const textPromptsPayload: Record<string, unknown> = {
    ...minimalPayload,
    text_prompts: [
      { text: prompt, weight: 1 },
      ...(negativePrompt ? [{ text: negativePrompt, weight: -1 }] : []),
    ],
  };

  delete textPromptsPayload.prompt;

  if (isFlux) {
    const compatibilityPayload: Record<string, unknown> = {
      ...minimalPayload,
      num_inference_steps: steps,
      guidance_scale: cfgScale ?? 3.5,
    };
    delete compatibilityPayload.steps;
    delete compatibilityPayload.cfg_scale;

    return fluxEditing
      ? [detailedPayload, minimalPayload, compatibilityPayload]
      : [minimalPayload, detailedPayload, compatibilityPayload];
  }

  return [detailedPayload, minimalPayload, textPromptsPayload];
}

async function invokeGenAiModel(input: {
  baseUrl: string;
  apiKey: string;
  path: string;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed: number;
  steps: number;
  cfgScale?: number;
  stylePreset?: string;
  mode?: string;
  initImage?: string;
  imageStrength?: number;
  editImage?: string;
  mask?: string;
  modelId: string;
}) {
  const {
    baseUrl,
    apiKey,
    path,
    prompt,
    negativePrompt,
    width,
    height,
    seed,
    steps,
    cfgScale,
    stylePreset,
    mode,
    initImage,
    imageStrength,
    editImage,
    mask,
    modelId,
  } = input;

  const payloadVariants = buildGenAiPayloadVariants({
    prompt,
    negativePrompt,
    width,
    height,
    seed,
    steps,
    cfgScale,
    stylePreset,
    mode,
    initImage,
    imageStrength,
    editImage,
    mask,
    modelId,
  });

  let lastStatus = 502;
  let lastPayload: unknown = null;
  let lastResolvedUrl: string | null = null;

  for (const payload of payloadVariants) {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
    } catch (error) {
      lastStatus = 599;
      lastPayload = {
        error: error instanceof Error ? error.message : "Provider request failed",
      };
      continue;
    }

    const raw = await res.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = { raw };
    }

    const resolvedUrl = resolveImageUrl(parsed);
    lastStatus = res.status;
    lastPayload = parsed;
    lastResolvedUrl = resolvedUrl;

    if (res.ok && resolvedUrl) {
      return {
        ok: true,
        status: res.status,
        payload: parsed,
        resolvedUrl,
      };
    }

    if (res.status !== 400 && res.status !== 404 && res.status !== 422) {
      break;
    }
  }

  return {
    ok: false,
    status: lastStatus,
    payload: lastPayload,
    resolvedUrl: lastResolvedUrl,
  };
}

async function invokeImagesApiFallback(input: {
  apiKey: string;
  nimModels: string[];
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed: number;
  steps: number;
  cfgScale: number;
  stylePreset?: string;
  mode?: string;
  initImage?: string;
  imageStrength?: number;
  editImage?: string;
  mask?: string;
}) {
  const {
    apiKey,
    nimModels,
    prompt,
    negativePrompt,
    width,
    height,
    seed,
    steps,
    cfgScale,
    stylePreset,
    mode,
    initImage,
    imageStrength,
    editImage,
    mask,
  } = input;

  let lastStatus = 502;
  let lastPayload: unknown = null;

  for (const nimModel of nimModels) {
    for (const responseFormat of ["b64_json", "url"]) {
      let res: Response;
      try {
        res = await fetch(`${NIM_BASE}/images/generations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: nimModel,
            prompt,
            negative_prompt: negativePrompt || undefined,
            size: `${width}x${height}`,
            n: 1,
            seed,
            num_inference_steps: steps,
            guidance_scale: cfgScale,
            style_preset: stylePreset,
            mode,
            init_image: initImage,
            image_strength: imageStrength,
            image: editImage,
            mask,
            response_format: responseFormat,
          }),
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });
      } catch (error) {
        lastStatus = 599;
        lastPayload = {
          error: error instanceof Error ? error.message : "Legacy provider request failed",
        };
        continue;
      }

      const raw = await res.text();
      let parsed: unknown = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = { raw };
      }

      lastStatus = res.status;
      lastPayload = parsed;

      if (res.ok) {
        const resolvedUrl = resolveImageUrl(parsed);
        if (resolvedUrl) {
          return {
            ok: true,
            status: res.status,
            payload: parsed,
            resolvedUrl,
          };
        }
      }

      if (res.status !== 404) {
        // Keep trying format/model combinations before returning failure.
        continue;
      }
    }
  }

  return {
    ok: false,
    status: lastStatus,
    payload: lastPayload,
    resolvedUrl: null,
  };
}

export async function POST(req: NextRequest) {
  try {
    // Φ-docs · fail-closed gate: signed-in session OR internal service token.
    const gate = await requireGenAccess(req);
    if (!gate.ok) return gate.res;

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "NVIDIA_API_KEY is not configured" }, { status: 500 });
    }

    const body = (await req.json()) as {
      prompt?: string;
      negativePrompt?: string;
      model?: string;
      userId?: string;
      width?: number;
      height?: number;
      steps?: number;
      seed?: number;
      cfgScale?: number;
      stylePreset?: string;
      mode?: string;
      initImage?: string;
      imageStrength?: number;
      editImage?: string;
      mask?: string;
    };

    const prompt = (body.prompt || "").trim();
    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const { modelId, config: modelConfig } = resolveModelConfig(body.model);
    const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userId = (body.userId || forwardedFor || "anonymous").trim();
    const width = toClampedInt(body.width, 1024, 256, 2048);
    const height = toClampedInt(body.height, 1024, 256, 2048);
    const seed = toClampedInt(body.seed, 0, 0, 2_147_483_647);
    const stepsDefault = modelId === "flux-2-klein-4b" ? 4 : 28;
    const steps = toClampedInt(body.steps, stepsDefault, 1, 60);
    const cfgScale = Number.isFinite(Number(body.cfgScale))
      ? Math.max(1, Math.min(20, Number(body.cfgScale)))
      : modelId === "flux-2-klein-4b"
      ? 3.5
      : 7.5;
    const negativePrompt = typeof body.negativePrompt === "string" ? body.negativePrompt.trim() : "";
    const stylePreset = typeof body.stylePreset === "string" ? body.stylePreset.trim() : undefined;
    const mode = typeof body.mode === "string" ? body.mode.trim() : undefined;
    const initImage = typeof body.initImage === "string" ? body.initImage : undefined;
    const imageStrength = Number.isFinite(Number(body.imageStrength))
      ? Math.max(0, Math.min(1, Number(body.imageStrength)))
      : undefined;
    const editImage = typeof body.editImage === "string" ? body.editImage : undefined;
    const mask = typeof body.mask === "string" ? body.mask : undefined;

    const day = getDayStamp();
    const key = getQuotaKey(userId, day);
    const used = quotaStore.get(key) || 0;
    if (used >= IMAGE_LIMIT_PER_DAY) {
      return Response.json(
        {
          error: `Daily image generation limit reached (${IMAGE_LIMIT_PER_DAY}/day).`,
          quota: `${IMAGE_LIMIT_PER_DAY}/day`,
        },
        { status: 429 },
      );
    }

    // Φ9 qwen-image + qwen-image-edit fast path — bypasses the legacy GenAI
    // payload machinery (NeMo `text_prompts`) since qwen lives on NIM's native
    // /infer shapes. Returns a base64 data URL directly to the client.
    if (modelId === "qwen-image" || modelId === "qwen-image-edit") {
      const qwenRes = await handleQwenInfer({
        prompt,
        modelId,
        width,
        height,
        seed,
        editImage,
        apiKey,
      });
      if ("url" in qwenRes) {
        quotaStore.set(key, used + 1);
        return Response.json({
          url: qwenRes.url,
          usage: { used: used + 1, limit: IMAGE_LIMIT_PER_DAY },
          model: modelConfig.nimModel,
        });
      }
      return Response.json(
        {
          error: qwenRes.error || "qwen-infer failed",
          usage: { used, limit: IMAGE_LIMIT_PER_DAY },
        },
        { status: qwenRes.status },
      );
    }

    const genaiAttempts: GenAiAttempt[] = [];
    type ModelGenerationSuccess = {
      ok: true;
      modelId: ImageModelId;
      resolvedUrl: string;
      providerBase: string | null;
      providerPath: string | null;
      resolvedWidth: number;
      resolvedHeight: number;
      source: "genai" | "images";
      diagnostics: unknown;
    };

    type ModelGenerationFailure = {
      ok: false;
      modelId: ImageModelId;
      status: number;
      diagnostics: unknown;
      triedModels?: string[];
    };

    const attemptModelGeneration = async (
      targetModelId: ImageModelId,
      targetConfig: ImageModelConfig,
    ): Promise<ModelGenerationSuccess | ModelGenerationFailure> => {
      const { width: targetWidth, height: targetHeight } = getModelDimensions(targetModelId, width, height);
      let resolvedUrl: string | null = null;
      let resolvedProviderBase: string | null = null;
      let resolvedProviderPath: string | null = null;
      let diagnostics: unknown = null;
      let source: "genai" | "images" = "genai";
      let lastGenAiStatus: number | null = null;
      let lastGenAiPayload: unknown = null;

      for (const baseUrl of GENAI_BASE_URLS) {
        for (const path of uniqueNonEmpty(targetConfig.genaiPaths)) {
          const genai = await invokeGenAiModel({
            baseUrl,
            apiKey,
            path,
            prompt,
            negativePrompt,
            width: targetWidth,
            height: targetHeight,
            seed,
            steps,
            cfgScale,
            stylePreset,
            mode,
            initImage,
            imageStrength,
            editImage,
            mask,
            modelId: targetModelId,
          });

          genaiAttempts.push({
            modelId: targetModelId,
            baseUrl,
            path,
            status: genai.status,
          });

          diagnostics = genai.payload;
          lastGenAiStatus = genai.status;
          lastGenAiPayload = genai.payload;
          if (genai.ok) {
            resolvedUrl = genai.resolvedUrl || resolveImageUrl(genai.payload);
            if (resolvedUrl) {
              resolvedProviderBase = baseUrl;
              resolvedProviderPath = path;
              break;
            }
          }
        }

        if (resolvedUrl) {
          break;
        }
      }

      if (!resolvedUrl && lastGenAiStatus !== null && lastGenAiStatus !== 404) {
        return {
          ok: false,
          modelId: targetModelId,
          status: lastGenAiStatus,
          diagnostics: lastGenAiPayload,
        };
      }

      if (!resolvedUrl) {
        const fallbackNimModels = uniqueNonEmpty([targetConfig.nimModel, ...(targetConfig.nimFallbackModels || [])]);

        const fallback = await invokeImagesApiFallback({
          apiKey,
          nimModels: fallbackNimModels,
          prompt,
          negativePrompt,
          width: targetWidth,
          height: targetHeight,
          seed,
          steps,
          cfgScale,
          stylePreset,
          mode,
          initImage,
          imageStrength,
          editImage,
          mask,
        });

        diagnostics = fallback.payload;
        if (!fallback.ok) {
          return {
            ok: false,
            modelId: targetModelId,
            status: fallback.status,
            diagnostics,
            triedModels: fallbackNimModels,
          };
        }

        resolvedUrl = fallback.resolvedUrl || resolveImageUrl(fallback.payload);
        source = "images";
      }

      if (!resolvedUrl) {
        return {
          ok: false,
          modelId: targetModelId,
          status: 502,
          diagnostics: {
            error: "No image payload returned from provider",
            details: diagnostics,
          },
        };
      }

      return {
        ok: true,
        modelId: targetModelId,
        resolvedUrl,
        providerBase: resolvedProviderBase,
        providerPath: resolvedProviderPath,
        resolvedWidth: targetWidth,
        resolvedHeight: targetHeight,
        source,
        diagnostics,
      };
    };

    const requestedResult = await attemptModelGeneration(modelId, modelConfig);

    let successResult: ModelGenerationSuccess | null = requestedResult.ok ? requestedResult : null;
    let failureResult: ModelGenerationFailure | null = requestedResult.ok ? null : requestedResult;
    let fallbackMetadata:
      | {
          used: true;
          fromModelId: ImageModelId;
          toModelId: ImageModelId;
          reason: string;
        }
      | {
          used: false;
        } = { used: false };

    if (!successResult && failureResult?.status === 404 && modelConfig.fallbackModelId) {
      const fallbackModelId = modelConfig.fallbackModelId as ImageModelId;
      const fallbackConfig = IMAGE_MODEL_CONFIGS[fallbackModelId];

      if (fallbackConfig) {
        const explicitFallbackResult = await attemptModelGeneration(fallbackModelId, fallbackConfig);
        if (explicitFallbackResult.ok) {
          successResult = explicitFallbackResult;
          failureResult = null;
          fallbackMetadata = {
            used: true,
            fromModelId: modelId,
            toModelId: fallbackModelId,
            reason: modelConfig.fallbackReason || "Requested model unavailable on provider.",
          };
        } else {
          return Response.json(
            {
              error: `Image generation failed (${explicitFallbackResult.status})`,
              requestedModelId: modelId,
              fallbackModelId,
              requestedDetails: failureResult.diagnostics,
              fallbackDetails: explicitFallbackResult.diagnostics,
              fallbackTriedModels: explicitFallbackResult.triedModels,
              genaiAttempts,
            },
            { status: explicitFallbackResult.status },
          );
        }
      }
    }

    if (!successResult && failureResult) {
      return Response.json(
        {
          error: `Image generation failed (${failureResult.status})`,
          requestedModelId: modelId,
          triedModels: failureResult.triedModels,
          details: failureResult.diagnostics,
          genaiAttempts,
          suggestedFallbackModelId: modelConfig.fallbackModelId,
        },
        { status: failureResult.status },
      );
    }

    if (!successResult) {
      return Response.json(
        {
          error: "Image generation failed (unexpected state)",
          requestedModelId: modelId,
          genaiAttempts,
        },
        { status: 502 },
      );
    }

    quotaStore.set(key, used + 1);

    const resolvedModelId = successResult.modelId;

    return Response.json({
      ok: true,
      model: IMAGE_MODEL_CONFIGS[resolvedModelId].nimModel,
      requestedModelId: modelId,
      resolvedModelId,
      fallback: fallbackMetadata,
      providerPath: successResult.providerPath,
      providerBase: successResult.providerBase,
      url: successResult.resolvedUrl,
      source: successResult.source,
      id: crypto.randomUUID(),
      params: {
        seed,
        steps,
        width: successResult.resolvedWidth,
        height: successResult.resolvedHeight,
        cfgScale,
      },
      usage: {
        used: used + 1,
        limit: IMAGE_LIMIT_PER_DAY,
      },
    });
  } catch (error) {
    console.error("[/api/generate/image] error", error);
    return Response.json({ error: "Failed to generate image" }, { status: 500 });
  }
}
