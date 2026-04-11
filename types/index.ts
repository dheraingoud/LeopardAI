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
  type: "code" | "html" | "react" | "markdown" | "csv" | "svg" | "mermaid";
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
    id: "gemma-4-31b",
    nimId: "google/gemma-4-31b-it",
    name: "Gemma 4 31B",
    provider: "Google",
    description: "Latest Gemma with thinking mode — excellent reasoning and code.",
    contextWindow: 128000,
    speed: "medium",
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
    badge: "Default",
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
    badge: "MoE",
    available: false,
  },
  {
    id: "glm5",
    nimId: "z-ai/glm5",
    name: "GLM-5",
    provider: "Z-AI",
    description: "744B MoE — currently unavailable on free tier.",
    contextWindow: 128000,
    speed: "slow",
    available: false,
  },
];

export const DEFAULT_MODEL = MODELS[0];

export const SUGGESTED_PROMPTS = [
  {
    title: "Write a function",
    description: "that reverses a linked list in-place with O(1) space",
    icon: "code" as const,
  },
  {
    title: "Explain quantum computing",
    description: "in simple terms with real-world analogies",
    icon: "book" as const,
  },
  {
    title: "Design a database schema",
    description: "for a Twitter-like social media application",
    icon: "database" as const,
  },
  {
    title: "Help me debug",
    description: "why my React component re-renders infinitely",
    icon: "bug" as const,
  },
];
