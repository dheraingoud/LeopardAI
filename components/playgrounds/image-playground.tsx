"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { motion } from "framer-motion";
import {
  Download,
  History,
  Loader2,
  Plus,
  RefreshCcw,
  Settings2,
  Share2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

interface ImagePlaygroundProps {
  defaultModelId: string;
  userId?: string;
}

type AspectRatio = "1:1" | "16:9" | "9:16" | "3:2" | "2:3";
type FluxMode = "text-to-image" | "edit-inpaint";
type Sd35Mode = "base" | "base+canny" | "base+depth";

interface GenerationRecord {
  id: string;
  model: string;
  url: string;
  prompt: string;
  negativePrompt: string;
  aspectRatio: AspectRatio;
  seed: number;
  steps: number;
  cfgScale: number;
  stylePreset?: string;
  createdAt: number;
}

const HISTORY_LIMIT = 12;

const MODEL_OPTIONS = [
  { id: "sd-3.5-large", label: "SD 3.5 Large" },
  { id: "flux-2-klein-4b", label: "FLUX.2 Klein 4B" },
  { id: "stable-diffusion-xl-base", label: "SDXL Base 1.0" },
] as const;

const ASPECT_RATIO_CONFIG: Record<
  AspectRatio,
  { width: number; height: number; swatchClassName: string }
> = {
  "1:1": { width: 1024, height: 1024, swatchClassName: "h-4 w-4" },
  "16:9": { width: 1344, height: 768, swatchClassName: "h-3 w-5" },
  "9:16": { width: 768, height: 1344, swatchClassName: "h-5 w-3" },
  "3:2": { width: 1216, height: 832, swatchClassName: "h-3.5 w-5" },
  "2:3": { width: 832, height: 1216, swatchClassName: "h-5 w-3.5" },
};

const SDXL_STYLE_PRESETS = [
  "photographic",
  "cinematic",
  "anime",
  "digital-art",
  "isometric",
  "comic",
  "line-art",
  "neon-punk",
];

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatModelLabel(modelId: string) {
  return MODEL_OPTIONS.find((entry) => entry.id === modelId)?.label || "Image Model";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function ImagePlayground({ defaultModelId, userId }: ImagePlaygroundProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const effectiveUserId = userId || user?.id || "anonymous";
  const [prompt, setPrompt] = useState(
    "A cinematic close-up of a leopard in rain, neon reflections, shallow depth of field",
  );
  const [negativePrompt, setNegativePrompt] = useState("low quality, blurry, distorted anatomy");
  const [model, setModel] = useState(defaultModelId);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [steps, setSteps] = useState(30);
  const [cfgScale, setCfgScale] = useState(7.5);
  const [seed, setSeed] = useState(42);
  const [stylePreset, setStylePreset] = useState("photographic");
  const [sd35Mode, setSd35Mode] = useState<Sd35Mode>("base");
  const [img2imgEnabled, setImg2imgEnabled] = useState(false);
  const [sourceImageData, setSourceImageData] = useState<string | null>(null);
  const [imageStrength, setImageStrength] = useState(0.55);
  const [fluxMode, setFluxMode] = useState<FluxMode>("text-to-image");

  const [loading, setLoading] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [resolvedModelId, setResolvedModelId] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState("");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [fluxLiveArmed, setFluxLiveArmed] = useState(false);
  const [inpaintSourceData, setInpaintSourceData] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState(24);
  const [isErasingMask, setIsErasingMask] = useState(false);

  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingMaskRef = useRef(false);
  const lastMaskPointRef = useRef<{ x: number; y: number } | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);

  const isFlux = model === "flux-2-klein-4b";
  const isSdxl = model === "stable-diffusion-xl-base";
  const isSd35 = model === "sd-3.5-large";

  const paramsStorageKey = useMemo(() => `leopard:image:params:${model}`, [model]);
  const historyStorageKey = useMemo(() => `leopard:image:history:${model}`, [model]);

  const resolvedSize = useMemo(() => {
    if (isSdxl) {
      return { width: 1024, height: 1024 };
    }
    return ASPECT_RATIO_CONFIG[aspectRatio];
  }, [aspectRatio, isSdxl]);

  const resetMaskCanvas = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const applyHistory = useCallback((record: GenerationRecord) => {
    setPrompt(record.prompt);
    setNegativePrompt(record.negativePrompt);
    setAspectRatio(record.aspectRatio);
    setSeed(record.seed);
    setSteps(record.steps);
    setCfgScale(record.cfgScale);
    if (record.stylePreset) {
      setStylePreset(record.stylePreset);
    }
    setImageUrl(record.url);
    setErrorText("");
  }, []);

  const addToHistory = useCallback(
    (url: string) => {
      const record: GenerationRecord = {
        id: crypto.randomUUID(),
        model,
        url,
        prompt,
        negativePrompt,
        aspectRatio,
        seed,
        steps,
        cfgScale,
        stylePreset: isSdxl ? stylePreset : undefined,
        createdAt: Date.now(),
      };

      setHistory((prev) => [record, ...prev.filter((entry) => entry.url !== url)].slice(0, HISTORY_LIMIT));
    },
    [aspectRatio, cfgScale, isSdxl, model, negativePrompt, prompt, seed, steps, stylePreset],
  );

  const requestGeneration = useCallback(
    async ({ livePreview = false }: { livePreview?: boolean } = {}) => {
      const cleanPrompt = prompt.trim();
      if (!cleanPrompt) {
        if (!livePreview) toast.error("Prompt is required");
        return;
      }

      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }

      const controller = new AbortController();
      activeControllerRef.current = controller;

      setErrorText("");
      if (livePreview) {
        setLiveLoading(true);
      } else {
        setLoading(true);
      }

      const payload: Record<string, unknown> = {
        prompt: cleanPrompt,
        negativePrompt: negativePrompt.trim(),
        model,
        userId: effectiveUserId,
        width: resolvedSize.width,
        height: resolvedSize.height,
        steps,
        seed,
        cfgScale,
      };

      if (isSdxl) {
        payload.stylePreset = stylePreset;
      }

      if (isSd35) {
        payload.mode = sd35Mode;
      }

      if (isSd35 && img2imgEnabled && sourceImageData) {
        payload.initImage = sourceImageData;
        payload.imageStrength = imageStrength;
      }

      if (isFlux && fluxMode === "edit-inpaint" && inpaintSourceData) {
        payload.editImage = inpaintSourceData;
        payload.mask = maskCanvasRef.current?.toDataURL("image/png");
      }

      try {
        const res = await fetch("/api/generate/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const body = (await res.json()) as {
          url?: string;
          error?: string;
          resolvedModelId?: string;
          fallback?: {
            used?: boolean;
            fromModelId?: string;
            toModelId?: string;
            reason?: string;
          };
        };
        if (!res.ok || !body.url) {
          throw new Error(body.error || "Failed to generate image");
        }

        const actualModelId = typeof body.resolvedModelId === "string" ? body.resolvedModelId : model;
        setResolvedModelId(actualModelId);
        if (body.fallback?.used) {
          const fromLabel = formatModelLabel(body.fallback.fromModelId || model);
          const toLabel = formatModelLabel(body.fallback.toModelId || actualModelId);
          const reason = body.fallback.reason ? ` ${body.fallback.reason}` : "";
          setFallbackNotice(`${fromLabel} unavailable. Generated with ${toLabel}.${reason}`);
        } else {
          setFallbackNotice("");
        }

        setImageUrl(body.url);
        addToHistory(body.url);

        if (!livePreview) {
          toast.success("Image generated");
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        const message = error instanceof Error ? error.message : "Image generation failed";
        setErrorText(message);
        setResolvedModelId(null);
        setFallbackNotice("");
        if (!livePreview) {
          toast.error(message);
        }
      } finally {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
        }
        if (livePreview) {
          setLiveLoading(false);
        } else {
          setLoading(false);
        }
      }
    },
    [
      addToHistory,
      cfgScale,
      fluxMode,
      imageStrength,
      img2imgEnabled,
      inpaintSourceData,
      isFlux,
      isSd35,
      isSdxl,
      model,
      negativePrompt,
      prompt,
      resolvedSize.height,
      resolvedSize.width,
      sd35Mode,
      seed,
      sourceImageData,
      steps,
      stylePreset,
      effectiveUserId,
    ],
  );

  const randomizeSeed = useCallback(() => {
    setSeed(Math.floor(Math.random() * 2_147_483_647));
    if (isFlux) {
      setFluxLiveArmed(true);
    }
  }, [isFlux]);

  const downloadImage = useCallback(() => {
    if (!imageUrl) {
      toast.error("No image available to download");
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = imageUrl;
    anchor.download = `leopard-${model}-${Date.now()}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, [imageUrl, model]);

  const shareImage = useCallback(async () => {
    if (!imageUrl) {
      toast.error("No image available to share");
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Leopard image output",
          text: prompt,
          url: imageUrl,
        });
      } else {
        await navigator.clipboard.writeText(imageUrl);
        toast.success("Image URL copied to clipboard");
      }
    } catch {
      toast.error("Share failed");
    }
  }, [imageUrl, prompt]);

  const cancelActiveGeneration = useCallback(() => {
    if (!activeControllerRef.current) return;
    activeControllerRef.current.abort();
    setLoading(false);
    setLiveLoading(false);
    toast.message("Generation canceled");
  }, []);

  const handleSourceUpload = useCallback(async (file: File | null, target: "sd35" | "inpaint") => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (target === "sd35") {
        setSourceImageData(dataUrl);
      } else {
        setInpaintSourceData(dataUrl);
      }
    } catch {
      toast.error("Unable to read uploaded image");
    }
  }, []);

  const beginMaskDraw = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = maskCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
      isDrawingMaskRef.current = true;
      lastMaskPointRef.current = { x, y };
    },
    [],
  );

  const continueMaskDraw = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingMaskRef.current) return;
      const canvas = maskCanvasRef.current;
      if (!canvas) return;
      const previous = lastMaskPointRef.current;
      if (!previous) return;

      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.globalCompositeOperation = isErasingMask ? "destination-out" : "source-over";
      ctx.strokeStyle = "rgba(255, 180, 0, 0.9)";
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      lastMaskPointRef.current = { x, y };
    },
    [brushSize, isErasingMask],
  );

  const endMaskDraw = useCallback(() => {
    isDrawingMaskRef.current = false;
    lastMaskPointRef.current = null;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(paramsStorageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Partial<{
        prompt: string;
        negativePrompt: string;
        aspectRatio: AspectRatio;
        steps: number;
        cfgScale: number;
        seed: number;
        stylePreset: string;
        sd35Mode: Sd35Mode;
        img2imgEnabled: boolean;
        imageStrength: number;
        fluxMode: FluxMode;
      }>;

      if (parsed.prompt) setPrompt(parsed.prompt);
      if (parsed.negativePrompt) setNegativePrompt(parsed.negativePrompt);
      if (parsed.aspectRatio) setAspectRatio(parsed.aspectRatio);
      if (typeof parsed.steps === "number") setSteps(clampNumber(parsed.steps, 1, 60));
      if (typeof parsed.cfgScale === "number") setCfgScale(clampNumber(parsed.cfgScale, 1, 20));
      if (typeof parsed.seed === "number") setSeed(Math.max(0, Math.round(parsed.seed)));
      if (parsed.stylePreset) setStylePreset(parsed.stylePreset);
      if (parsed.sd35Mode) setSd35Mode(parsed.sd35Mode);
      if (typeof parsed.img2imgEnabled === "boolean") setImg2imgEnabled(parsed.img2imgEnabled);
      if (typeof parsed.imageStrength === "number") setImageStrength(clampNumber(parsed.imageStrength, 0, 1));
      if (parsed.fluxMode) setFluxMode(parsed.fluxMode);
    } catch {
      // Ignore malformed local storage payload.
    }
  }, [paramsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = {
      prompt,
      negativePrompt,
      aspectRatio,
      steps,
      cfgScale,
      seed,
      stylePreset,
      sd35Mode,
      img2imgEnabled,
      imageStrength,
      fluxMode,
    };
    window.localStorage.setItem(paramsStorageKey, JSON.stringify(payload));
  }, [
    aspectRatio,
    cfgScale,
    fluxMode,
    imageStrength,
    img2imgEnabled,
    negativePrompt,
    paramsStorageKey,
    prompt,
    sd35Mode,
    seed,
    steps,
    stylePreset,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(historyStorageKey);
    if (!raw) {
      setHistory([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as GenerationRecord[];
      if (Array.isArray(parsed)) {
        setHistory(parsed.slice(0, HISTORY_LIMIT));
      }
    } catch {
      setHistory([]);
    }
  }, [historyStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(historyStorageKey, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
  }, [history, historyStorageKey]);

  useEffect(() => {
    if (!isFlux || fluxMode !== "text-to-image" || !fluxLiveArmed) return;
    if (!prompt.trim()) return;

    const timer = window.setTimeout(() => {
      void requestGeneration({ livePreview: true });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [cfgScale, fluxLiveArmed, fluxMode, isFlux, prompt, requestGeneration, seed, steps]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void requestGeneration();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        if (!imageUrl) return;
        event.preventDefault();
        downloadImage();
      }

      if (event.key === "Escape") {
        cancelActiveGeneration();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelActiveGeneration, downloadImage, imageUrl, requestGeneration]);

  useEffect(() => {
    setModel(defaultModelId);
  }, [defaultModelId]);

  useEffect(() => {
    // Avoid stale preview carry-over when changing model tabs.
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
      activeControllerRef.current = null;
    }
    setLoading(false);
    setLiveLoading(false);
    setImageUrl(null);
    setResolvedModelId(null);
    setFallbackNotice("");
    setErrorText("");
    setFluxLiveArmed(false);
  }, [model]);

  const currentModelLabel = formatModelLabel(model);

  const renderCanvas = () => (
    <div className="relative min-h-[360px] rounded-2xl border border-white/10 bg-[#111111] p-4 sm:p-6 grid place-items-center overflow-hidden">
      {(loading || liveLoading) && (
        <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,rgba(255,255,255,0.02)_8%,rgba(255,255,255,0.08)_18%,rgba(255,255,255,0.02)_33%)] bg-[length:200%_100%]" />
      )}

      {!imageUrl && !loading && !liveLoading && (
        <div className="text-center px-4">
          <p className="text-sm text-[#a8a8a8]">Generated image will appear here</p>
          <p className="text-xs text-[#666] mt-1">Ctrl/Cmd + Enter to generate</p>
        </div>
      )}

      {imageUrl && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="group relative"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Generated output"
            className="h-auto max-h-[560px] max-w-full rounded-xl border border-white/10 shadow-2xl transition-opacity duration-300"
          />
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-end gap-2 px-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <button
              onClick={downloadImage}
              className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/55 text-[#dddddd] hover:text-white"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                void shareImage();
              }}
              className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/55 text-[#dddddd] hover:text-white"
              title="Share"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );

  const renderHistoryStrip = () => (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#8d8d8d]">History</p>
        <button
          onClick={() => setHistoryOpen((prev) => !prev)}
          className="inline-flex items-center gap-1 text-[10px] text-[#8d8d8d] hover:text-[#d4d4d4]"
        >
          <History className="h-3 w-3" />
          {historyOpen ? "Hide" : "Show"}
        </button>
      </div>

      {historyOpen && (
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
          {history.length === 0 && (
            <p className="text-xs text-[#666] py-4">No generations yet.</p>
          )}

          {history.map((record) => (
            <button
              key={record.id}
              onClick={() => applyHistory(record)}
              className="group min-w-[130px] snap-start rounded-lg border border-white/10 bg-[#0f0f0f] p-1.5 text-left hover:border-[#ffb40040]"
              title={record.prompt}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={record.url}
                alt="History output"
                className="h-20 w-full rounded-md object-cover border border-white/10"
              />
              <p className="mt-1 truncate text-[10px] text-[#bfbfbf]">{record.prompt}</p>
              <p className="text-[9px] text-[#6f6f6f]">
                Seed {record.seed} | Steps {record.steps}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderFluxStudio = () => (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#ffb40022] bg-[linear-gradient(180deg,#0d0d0d_0%,#0b0b0b_100%)] p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-[#ffb40040] bg-[#ffb40014] px-2.5 py-1 font-semibold text-[#ffca63]">
            ⚡ {currentModelLabel}
          </span>
          <button
            onClick={() => setFluxMode("text-to-image")}
            className={`rounded-full px-3 py-1 transition ${
              fluxMode === "text-to-image"
                ? "bg-white/12 text-white"
                : "bg-white/[0.04] text-[#8f8f8f] hover:text-[#d5d5d5]"
            }`}
          >
            Text-to-Image
          </button>
          <button
            onClick={() => setFluxMode("edit-inpaint")}
            className={`rounded-full px-3 py-1 transition ${
              fluxMode === "edit-inpaint"
                ? "bg-white/12 text-white"
                : "bg-white/[0.04] text-[#8f8f8f] hover:text-[#d5d5d5]"
            }`}
          >
            Edit / Inpaint
          </button>
        </div>

        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-[#858585]">Prompt</label>
        <textarea
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            setFluxLiveArmed(true);
          }}
          placeholder="Write your prompt here — preview updates as you type"
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-[#e9e9e9] outline-none focus:border-[#ffb40055]"
        />
      </div>

      {fluxMode === "text-to-image" ? (
        <div className="space-y-3">
          {renderCanvas()}

          <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <label className="space-y-1">
                <span className="block text-[#8f8f8f]">Steps</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={steps}
                  onChange={(event) => {
                    setSteps(clampNumber(parseNumber(event.target.value, 4), 1, 12));
                    setFluxLiveArmed(true);
                  }}
                  className="w-full rounded-lg border border-white/10 bg-black/35 px-2 py-1.5 text-[#d6d6d6]"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[#8f8f8f]">Guidance</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  step={0.1}
                  value={cfgScale}
                  onChange={(event) => {
                    setCfgScale(clampNumber(parseNumber(event.target.value, 3.5), 1, 12));
                    setFluxLiveArmed(true);
                  }}
                  className="w-full rounded-lg border border-white/10 bg-black/35 px-2 py-1.5 text-[#d6d6d6]"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[#8f8f8f]">Seed</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={seed}
                    onChange={(event) => {
                      setSeed(Math.max(0, Math.round(parseNumber(event.target.value, 0))));
                      setFluxLiveArmed(true);
                    }}
                    className="w-full rounded-lg border border-white/10 bg-black/35 px-2 py-1.5 text-[#d6d6d6]"
                  />
                  <button
                    onClick={randomizeSeed}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[#d4d4d4] hover:text-white"
                    title="Random seed"
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  void requestGeneration();
                }}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-[#76c442] px-3 py-2 text-xs font-semibold text-black disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Generate Now
              </button>
              <button
                onClick={downloadImage}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[#d3d3d3] hover:text-white"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </button>
              <button
                onClick={() => {
                  void shareImage();
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[#d3d3d3] hover:text-white"
              >
                <Share2 className="h-3.5 w-3.5" /> Share
              </button>
            </div>
          </div>

          {renderHistoryStrip()}
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-[#0c0c0c] p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wider text-[#858585]">Before</p>
              <label className="relative block overflow-hidden rounded-xl border border-dashed border-white/15 bg-black/35 p-3 min-h-[280px]">
                {inpaintSourceData ? (
                  <div className="relative h-full w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={inpaintSourceData}
                      alt="Edit source"
                      className="h-[280px] w-full rounded-lg object-cover"
                    />
                    <canvas
                      ref={maskCanvasRef}
                      width={512}
                      height={512}
                      onPointerDown={beginMaskDraw}
                      onPointerMove={continueMaskDraw}
                      onPointerUp={endMaskDraw}
                      onPointerLeave={endMaskDraw}
                      className="absolute inset-0 h-[280px] w-full touch-none rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="grid h-full place-items-center py-10 text-center text-[#757575] text-xs">
                    Upload an image to start masking edits.
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    void handleSourceUpload(event.target.files?.[0] || null, "inpaint");
                  }}
                />
              </label>
            </div>

            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wider text-[#858585]">After</p>
              <div className="rounded-xl border border-white/10 bg-[#111111] min-h-[280px] grid place-items-center p-3">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="Edited result" className="h-[280px] w-full rounded-lg object-cover" />
                ) : (
                  <p className="text-xs text-[#707070]">Edited image appears here</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <label className="space-y-1 text-xs text-[#9c9c9c]">
              Brush size
              <input
                type="range"
                min={4}
                max={64}
                value={brushSize}
                onChange={(event) => setBrushSize(parseNumber(event.target.value, 24))}
                className="w-full"
              />
            </label>
            <button
              onClick={() => setIsErasingMask((prev) => !prev)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[#d4d4d4]"
            >
              {isErasingMask ? "Draw mask" : "Erase mask"}
            </button>
            <button
              onClick={resetMaskCanvas}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[#d4d4d4]"
            >
              Reset
            </button>
          </div>

          <label className="space-y-1 block text-xs text-[#8f8f8f]">
            Edit prompt
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={3}
              placeholder="Describe what to put in the masked area"
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-[#e9e9e9]"
            />
          </label>

          <button
            onClick={() => {
              void requestGeneration();
            }}
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#76c442] px-3 py-2 text-xs font-semibold text-black disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Apply Edit
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,#111111_0%,#0b0b0b_100%)] p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[#d8d8d8]">
            {currentModelLabel}
          </span>
          <button
            onClick={() => setHistoryOpen((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[#a8a8a8]"
          >
            <History className="h-3 w-3" /> History
          </button>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[#8c8c8c]">
            <Settings2 className="h-3 w-3" /> Settings
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {MODEL_OPTIONS.map((entry) => (
            <button
              key={entry.id}
              onClick={() => {
                if (model === entry.id) return;
                setModel(entry.id);
                setErrorText("");
                const fromChat = searchParams.get("fromChat");
                const target = fromChat
                  ? `/app/playground/${entry.id}?fromChat=${encodeURIComponent(fromChat)}`
                  : `/app/playground/${entry.id}`;
                router.replace(target);
              }}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                model === entry.id
                  ? "bg-[#ffb4001a] border border-[#ffb4003d] text-[#ffd37a]"
                  : "bg-white/[0.03] border border-white/10 text-[#a8a8a8] hover:text-[#d9d9d9]"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {errorText && (
          <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-2 text-xs text-red-300">
            {errorText}
          </div>
        )}

        {fallbackNotice && !errorText && (
          <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            {fallbackNotice}
          </div>
        )}
      </div>

      {isFlux ? (
        renderFluxStudio()
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-white/10 bg-[#1a1a1a] p-4 space-y-4 md:max-h-[72vh] overflow-y-auto">
            <div>
              <label className="mb-1 block text-xs text-[#8a8a8a] font-mono uppercase tracking-wider">Prompt</label>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-[#e6e6e6] outline-none focus:border-[#ffb40055]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-[#8a8a8a] font-mono uppercase tracking-wider">Negative Prompt</label>
              <textarea
                value={negativePrompt}
                onChange={(event) => setNegativePrompt(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-[#d6d6d6] outline-none focus:border-[#ffb40055]"
              />
            </div>

            {!isSdxl && (
              <div>
                <label className="mb-1 block text-xs text-[#8a8a8a] font-mono uppercase tracking-wider">Aspect Ratio</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(ASPECT_RATIO_CONFIG) as AspectRatio[]).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`rounded-lg border px-2 py-2 text-xs transition ${
                        aspectRatio === ratio
                          ? "border-[#ffb40055] bg-[#ffb40012] text-[#ffd27b]"
                          : "border-white/10 bg-black/20 text-[#a4a4a4]"
                      }`}
                    >
                      <span className="flex items-center justify-center gap-1">
                        <span
                          className={`inline-block rounded-[3px] border border-current/50 ${ASPECT_RATIO_CONFIG[ratio].swatchClassName}`}
                        />
                        {ratio}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isSdxl && (
              <div>
                <label className="mb-1 block text-xs text-[#8a8a8a] font-mono uppercase tracking-wider">Style Preset</label>
                <div className="grid grid-cols-2 gap-2">
                  {SDXL_STYLE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setStylePreset(preset)}
                      className={`rounded-lg border px-2 py-2 text-[11px] capitalize transition ${
                        stylePreset === preset
                          ? "border-[#ffb40055] bg-[#ffb40012] text-[#ffd27b]"
                          : "border-white/10 bg-black/20 text-[#a4a4a4]"
                      }`}
                    >
                      {preset.replaceAll("-", " ")}
                    </button>
                  ))}
                </div>
                <button className="mt-2 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-[#9f9f9f]">
                  <Plus className="h-3 w-3" /> Add prompt weight
                </button>
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-[#8a8a8a]">
                <span>Steps</span>
                <span>{steps}</span>
              </div>
              <input
                type="range"
                min={isSd35 ? 8 : 10}
                max={60}
                value={steps}
                onChange={(event) => setSteps(parseNumber(event.target.value, 30))}
                className="w-full"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-[#8a8a8a]">
                <span>CFG</span>
                <span>{cfgScale.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={1}
                max={16}
                step={0.1}
                value={cfgScale}
                onChange={(event) => setCfgScale(parseNumber(event.target.value, 7.5))}
                className="w-full"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-[#8a8a8a]">Seed</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={seed}
                  onChange={(event) => setSeed(Math.max(0, Math.round(parseNumber(event.target.value, 0))))}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-[#e6e6e6]"
                />
                <button
                  onClick={randomizeSeed}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[#d3d3d3]"
                  title="Random seed"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
              </div>
            </div>

            {isSd35 && (
              <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <label className="flex items-center justify-between text-xs text-[#c2c2c2]">
                  <span>Img2img</span>
                  <input
                    type="checkbox"
                    checked={img2imgEnabled}
                    onChange={(event) => setImg2imgEnabled(event.target.checked)}
                  />
                </label>

                <label className="block text-xs text-[#8a8a8a]">
                  Mode
                  <select
                    value={sd35Mode}
                    onChange={(event) => setSd35Mode(event.target.value as Sd35Mode)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-[#d8d8d8]"
                  >
                    <option value="base">base</option>
                    <option value="base+canny">base + canny</option>
                    <option value="base+depth">base + depth</option>
                  </select>
                </label>

                {img2imgEnabled && (
                  <>
                    <label className="block text-xs text-[#8a8a8a]">
                      Source image
                      <input
                        type="file"
                        accept="image/*"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-[#d8d8d8]"
                        onChange={(event) => {
                          void handleSourceUpload(event.target.files?.[0] || null, "sd35");
                        }}
                      />
                    </label>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-[#8a8a8a]">
                        <span>Image Strength</span>
                        <span>{imageStrength.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.01}
                        value={imageStrength}
                        onChange={(event) => setImageStrength(parseNumber(event.target.value, 0.55))}
                        className="w-full"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="sticky bottom-0 z-20 -mx-1 px-1 pb-1 pt-2 bg-[linear-gradient(180deg,rgba(26,26,26,0)_0%,rgba(26,26,26,0.9)_45%,rgba(26,26,26,1)_100%)]">
              <button
                onClick={() => {
                  if (loading) {
                    cancelActiveGeneration();
                    return;
                  }
                  void requestGeneration();
                }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#76c442] px-3 py-2 text-xs font-semibold text-black shadow-[0_10px_30px_rgba(118,196,66,0.25)] disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {loading ? "Cancel" : "Generate"}
              </button>
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            {renderCanvas()}
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-[#8c8c8c] flex flex-wrap items-center justify-between gap-2">
              <span>
                Model used: {formatModelLabel(resolvedModelId || model)} | Seed: {seed} | Steps: {steps} | {resolvedSize.width}x{resolvedSize.height}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={downloadImage} className="inline-flex items-center gap-1 text-[#d2d2d2] hover:text-white">
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
                <button
                  onClick={() => {
                    void shareImage();
                  }}
                  className="inline-flex items-center gap-1 text-[#d2d2d2] hover:text-white"
                >
                  <Share2 className="h-3.5 w-3.5" /> Share
                </button>
              </div>
            </div>
            {renderHistoryStrip()}
          </div>
        </div>
      )}
    </div>
  );
}
