import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { MODELS } from "@/types";
import ImagePlayground from "@/components/playgrounds/image-playground";
import AnalysisPlayground from "@/components/playgrounds/analysis-playground";
import VideoPlayground from "@/components/playgrounds/video-playground";

interface PageProps {
  params: Promise<{ modelId: string }>;
}

const MODEL_ALIASES: Record<string, string> = {
  "stable-diffusion-3.5-large": "sd-3.5-large",
  "stable-diffusion-3_5-large": "sd-3.5-large",
  "stabilityai/stable-diffusion-3.5-large": "sd-3.5-large",
  "stabilityai/stable-diffusion-3_5-large": "sd-3.5-large",
  "sd35": "sd-3.5-large",
  "flux.2-klein-4b": "flux-2-klein-4b",
  "flux_2-klein-4b": "flux-2-klein-4b",
  "flux-2-klien-4b": "flux-2-klein-4b",
  "black-forest-labs/flux.2-klein-4b": "flux-2-klein-4b",
  "black-forest-labs/flux_2-klein-4b": "flux-2-klein-4b",
  "sdxl-base-1.0": "stable-diffusion-xl-base",
  "stabilityai/stable-diffusion-xl": "stable-diffusion-xl-base",
  "stabilityai/stable-diffusion-xl-base-1.0": "stable-diffusion-xl-base",
  "nvidia/cosmos-reason2-8b": "cosmos-reason2-8b",
  "nvidia/cosmos-transfer2_5-2b": "cosmos-transfer2.5-2b",
  "cosmos-transfer2_5-2b": "cosmos-transfer2.5-2b",
};

function normalizeModelKey(value: string) {
  try {
    return decodeURIComponent(value).trim().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function resolveModel(modelId: string) {
  const normalized = normalizeModelKey(modelId);

  const byId = MODELS.find((entry) => entry.id === modelId || entry.id.toLowerCase() === normalized);
  if (byId) {
    return {
      model: byId,
      isCanonical: byId.id === modelId,
    };
  }

  const alias = MODEL_ALIASES[normalized];
  if (alias) {
    const byAlias = MODELS.find((entry) => entry.id === alias);
    if (byAlias) {
      return {
        model: byAlias,
        isCanonical: byAlias.id === modelId,
      };
    }
  }

  const byNimId = MODELS.find((entry) => entry.nimId.toLowerCase() === normalized);
  if (byNimId) {
    return {
      model: byNimId,
      isCanonical: byNimId.id === modelId,
    };
  }

  return {
    model: null,
    isCanonical: false,
  };
}

export default async function PlaygroundModelPage({ params }: PageProps) {
  const { modelId } = await params;
  const { model, isCanonical } = resolveModel(modelId);

  if (!model) {
    notFound();
  }

  if (!isCanonical) {
    redirect(`/app/playground/${model.id}`);
  }

  const modality = model.modality || "text";

  return (
    <main className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs font-mono uppercase tracking-wider text-[#8a8a8a]">Model Playground</p>
            <h1 className="text-2xl font-semibold text-[#ececec]">{model.name}</h1>
            <p className="text-sm text-[#9a9a9a]">{model.description}</p>
          </div>
          <Link
            href="/app"
            className="inline-flex h-9 items-center rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-[#d7d7d7] hover:text-white hover:bg-white/[0.06]"
          >
            Close
          </Link>
        </div>

        {modality === "image" && <ImagePlayground defaultModelId={model.id} />}

        {modality === "vision" && <AnalysisPlayground defaultModelId={model.id} />}

        {modality === "video-physics" && <VideoPlayground defaultModelId={model.id} />}

        {modality === "text" && (
          <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-4">
            <p className="text-sm text-[#a0a0a0]">
              This is a text model. Use the main chat interface for interactive testing.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
