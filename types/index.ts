import { Id } from "@/convex/_generated/dataModel";

/* ─── Database Types ─── */

export interface Chat {
  _id: Id<"chats">;
  userId: string;
  title: string;
  model: string;
  shared: boolean;
  shareId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  _id: Id<"messages">;
  chatId: Id<"chats">;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  createdAt: number;
}

/* ─── UI Types ─── */

export interface Model {
  id: string;
  nimId: string;
  name: string;
  provider: string;
  description: string;
  contextWindow: number;
  speed: "fast" | "medium" | "slow";
  modality?: "text" | "vision" | "image" | "video-physics";
  quota?: string;
  costMultiplier?: string;
  badge?: string;
  available: boolean; // Whether model is currently responding on NIM free tier
}

export interface UserSettings {
  theme: "dark";
  defaultModel: string;
  contextLength: number;
  streamingEnabled: boolean;
  sendWithEnter: boolean;
}

export interface Artifact {
  id: string;
  type: "code" | "html" | "react" | "markdown" | "csv" | "svg" | "mermaid" | "json";
  title: string;
  content: string;
  language?: string;
}

export interface StreamingState {
  isStreaming: boolean;
  isThinking: boolean; // True from request start until first token
  abortController: AbortController | null;
  messageId: Id<"messages"> | null;
}

/* ─── NVIDIA NIM Models ─────────────────────────────────────────────────────
 * Verified live on 2026-03-31 via build.nvidia.com/v1/models
 * API endpoint: https://integrate.api.nvidia.com/v1/chat/completions
 * Key format:   nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 * Header:       Authorization: Bearer <key>
 * ──────────────────────────────────────────────────────────────────────── */

export const MODELS: Model[] = [
  {
    id: "minimax-m2.7",
    nimId: "minimaxai/minimax-m2.7",
    name: "MiniMax M2.7",
    provider: "MiniMax",
    description: "Next-gen MiniMax model with faster, more stable coding performance.",
    contextWindow: 128000,
    speed: "fast",
    modality: "text",
    costMultiplier: "1.5x",
    badge: "Default",
    available: true,
  },
  {
    id: "gemma-4-31b",
    nimId: "google/gemma-4-31b-it",
    name: "Gemma 4 31B",
    provider: "Google",
    description: "Latest Gemma with thinking mode — excellent reasoning and code.",
    contextWindow: 128000,
    speed: "medium",
    modality: "text",
    costMultiplier: "1.5x",
    badge: "Thinking",
    available: true,
  },
  {
    id: "minimax-m2.5",
    nimId: "minimaxai/minimax-m2.5",
    name: "MiniMax M2.5",
    provider: "MiniMax",
    description: "Flash-speed inference optimized for agentic software tasks.",
    contextWindow: 128000,
    speed: "fast",
    modality: "text",
    costMultiplier: "1.5x",
    badge: "Legacy",
    available: true,
  },
  {
    id: "sd-3.5-large",
    nimId: "stabilityai/stable-diffusion-3_5-large",
    name: "Stable Diffusion 3.5 Large",
    provider: "Stability AI",
    description: "High-quality text-to-image generation. Limited to 5 image requests per day per user.",
    contextWindow: 1,
    speed: "slow",
    modality: "image",
    quota: "5/day",
    costMultiplier: "1x",
    badge: "Text-to-Image",
    available: true,
  },
  {
    id: "flux-2-klein-4b",
    nimId: "black-forest-labs/flux_2-klein_4b",
    name: "FLUX.2 Klein 4B",
    provider: "Black Forest Labs",
    description: "Fast text-to-image model optimized for rapid iterations and style exploration.",
    contextWindow: 1,
    speed: "fast",
    modality: "image",
    quota: "5/day",
    costMultiplier: "1x",
    badge: "Text-to-Image",
    available: true,
  },
  {
    id: "stable-diffusion-xl-base",
    nimId: "stabilityai/sdxl",
    name: "Stable Diffusion XL Base 1.0",
    provider: "Stability AI",
    description: "General-purpose SDXL text-to-image model for high-detail and composition control.",
    contextWindow: 1,
    speed: "medium",
    modality: "image",
    quota: "5/day",
    costMultiplier: "1x",
    badge: "Text-to-Image",
    available: true,
  },
  {
    id: "llama-3.2-11b-vision",
    nimId: "meta/llama-3.2-11b-vision-instruct",
    name: "Llama 3.2 11B Vision",
    provider: "Meta",
    description: "Vision-instruct model for image understanding and multimodal reasoning.",
    contextWindow: 128000,
    speed: "medium",
    modality: "vision",
    badge: "Vision",
    available: true,
  },
  {
    id: "llama-3.2-90b-vision",
    nimId: "meta/llama-3.2-90b-vision-instruct",
    name: "Llama 3.2 90B Vision",
    provider: "Meta",
    description: "High-capacity multimodal reasoning model for complex visual tasks.",
    contextWindow: 128000,
    speed: "slow",
    modality: "vision",
    badge: "Vision Pro",
    available: true,
  },
  {
    id: "nemotron-nano-vl-8b",
    nimId: "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
    name: "Nemotron Nano VL 8B",
    provider: "NVIDIA",
    description: "NVIDIA multimodal model optimized for efficient visual-language understanding.",
    contextWindow: 128000,
    speed: "fast",
    modality: "vision",
    badge: "Vision Fast",
    available: true,
  },
  {
    id: "cosmos-reason2-8b",
    nimId: "nvidia/cosmos-reason2-8b",
    name: "Cosmos Reason2 8B",
    provider: "NVIDIA",
    description: "Physics-first world-model reasoning for simulation-style prompts and motion constraints.",
    contextWindow: 131072,
    speed: "medium",
    modality: "video-physics",
    quota: "2/15 days",
    costMultiplier: "1x",
    badge: "Physics",
    available: true,
  },
  {
    id: "cosmos-transfer2.5-2b",
    nimId: "nvidia/cosmos-transfer2_5-2b",
    name: "Cosmos Transfer2.5 2B",
    provider: "NVIDIA",
    description: "World-transfer model for text-to-video or physics-aware scene transitions when endpoint is enabled.",
    contextWindow: 131072,
    speed: "slow",
    modality: "video-physics",
    quota: "2/15 days",
    costMultiplier: "1x",
    badge: "Video/Physics",
    available: true,
  },
  {
    id: "llama-3-70b",
    nimId: "meta/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    provider: "Meta",
    description: "Fastest open-weight model — superior code and instruction following.",
    contextWindow: 128000,
    speed: "fast",
    modality: "text",
    costMultiplier: "1x",
    badge: "Fast",
    available: true,
  },
  {
    id: "step-3.5-flash",
    nimId: "stepfun-ai/step-3.5-flash",
    name: "Step 3.5 Flash",
    provider: "StepFun",
    description: "Ultra-fast flash model — optimized for speed and efficiency.",
    contextWindow: 128000,
    speed: "fast",
    modality: "text",
    costMultiplier: "1x",
    badge: "New",
    available: true,
  },
  {
    id: "kimi-k2.5",
    nimId: "moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    provider: "Moonshot AI",
    description: "Multimodal MoE built for long-context reasoning at scale.",
    contextWindow: 128000,
    speed: "medium",
    modality: "text",
    costMultiplier: "3x",
    badge: "Large",
    available: true,
  },
  {
    id: "deepseek-v3.2",
    nimId: "deepseek-ai/deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "DeepSeek",
    description: "Advanced code and reasoning — currently unavailable on free tier.",
    contextWindow: 128000,
    speed: "slow",
    modality: "text",
    costMultiplier: "1x",
    available: false,
  },
  {
    id: "qwen-300b",
    nimId: "qwen/qwen3.5-397b-a17b",
    name: "Qwen 300B MoE",
    provider: "Alibaba",
    description: "397B hybrid MoE — currently unavailable on free tier.",
    contextWindow: 128000,
    speed: "slow",
    modality: "text",
    costMultiplier: "1x",
    badge: "MoE",
    available: false,
  },
  {
    id: "glm-5.1",
    nimId: "z-ai/glm-5.1",
    name: "GLM 5.1",
    provider: "Z-AI",
    description: "Upgraded GLM series model for deeper reasoning on long-context tasks.",
    contextWindow: 128000,
    speed: "slow",
    modality: "text",
    costMultiplier: "3x",
    available: true,
  },
];

export const DEFAULT_MODEL = MODELS[0];

export const SUGGESTED_PROMPTS = [
  {
    title: "Trace Current Code Flow",
    description: "generate a Mermaid flowchart for this module",
    icon: "code" as const,
  },
  {
    title: "Optimize Architecture",
    description: "compare current vs most efficient implementation",
    icon: "book" as const,
  },
  {
    title: "Design SQL Strategy",
    description: "indexes, migrations, and query performance plan",
    icon: "database" as const,
  },
  {
    title: "Audit This Implementation",
    description: "severity-ranked findings and fix plan",
    icon: "bug" as const,
  },
];
