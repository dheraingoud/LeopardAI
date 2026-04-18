const CHARS_PER_TOKEN = 4;
const CHARS_PER_TOKEN_CJK = 2.5;
const SYSTEM_PROMPT_RESERVE = 1000;
const RESPONSE_RESERVE = 3000;
const SAFETY_MARGIN = 0.05;
const MESSAGE_OVERHEAD = 4;
const IMAGE_TOKENS_VISION = 85;

const CJK_RANGES = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g;

export interface TokenMessage {
  role: string;
  content: string;
  imageUrls?: string[];
}

export interface ContextBudget {
  usedTokens: number;
  maxTokens: number;
  totalWindow: number;
  percentUsed: number;
  isOverBudget: boolean;
  isNearBudget: boolean;
  pendingTokens: number;
  pendingPercent: number;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;

  const cjkMatches = text.match(CJK_RANGES);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkCount = text.length - cjkCount;

  const tokens = (nonCjkCount / CHARS_PER_TOKEN) + (cjkCount / CHARS_PER_TOKEN_CJK);
  return Math.ceil(tokens);
}

export function estimateMessageTokens(msg: TokenMessage): number {
  const textTokens = estimateTokens(msg.content);
  const imageTokens = msg.imageUrls
    ? msg.imageUrls.length * IMAGE_TOKENS_VISION
    : 0;
  return textTokens + imageTokens + MESSAGE_OVERHEAD;
}

export function estimateConversationTokens(messages: TokenMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

export function getContextBudget(contextWindow: number): number {
  const budget = contextWindow - SYSTEM_PROMPT_RESERVE - RESPONSE_RESERVE;
  return Math.floor(budget * (1 - SAFETY_MARGIN));
}

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "google/gemma-4-31b-it": 128000,
  "minimaxai/minimax-m2.5": 128000,
  "minimaxai/minimax-m2.7": 128000,
  "meta/llama-3.3-70b-instruct": 128000,
  "stepfun-ai/step-3.5-flash": 128000,
  "moonshotai/kimi-k2.5": 128000,
  "deepseek-ai/deepseek-v3.2": 128000,
  "qwen/qwen3.5-397b-a17b": 128000,
  "z-ai/glm5": 128000,
  "meta/llama-3.2-11b-vision-instruct": 128000,
  "meta/llama-3.2-90b-vision-instruct": 128000,
  "microsoft/phi-3-vision-128k-instruct": 128000,
  "nvidia/llama-3.1-nemotron-nano-vl-8b-v1": 128000,
  "nvidia/cosmos-reason2-8b": 131072,
  "nvidia/cosmos-transfer2_5-2b": 131072,
  "stabilityai/stable-diffusion-3_5-large": 1,
  "black-forest-labs/flux_2-klein-4b": 1,
  "stabilityai/stable-diffusion-xl-base-1.0": 1,
};

const ALIAS_TO_NIM: Record<string, string> = {
  "gemma-4-31b": "google/gemma-4-31b-it",
  "llama-3-70b": "meta/llama-3.3-70b-instruct",
  "step-3.5-flash": "stepfun-ai/step-3.5-flash",
  "minimax-m2.5": "minimaxai/minimax-m2.5",
  "minimax-m2.7": "minimaxai/minimax-m2.7",
  "kimi-k2.5": "moonshotai/kimi-k2.5",
  "deepseek-v3.2": "deepseek-ai/deepseek-v3.2",
  "qwen-300b": "qwen/qwen3.5-397b-a17b",
  "glm5": "z-ai/glm5",
  "llama-3.2-11b-vision": "meta/llama-3.2-11b-vision-instruct",
  "llama-3.2-90b-vision": "meta/llama-3.2-90b-vision-instruct",
  "phi-3-vision-128k": "microsoft/phi-3-vision-128k-instruct",
  "nemotron-nano-vl-8b": "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
  "cosmos-reason2-8b": "nvidia/cosmos-reason2-8b",
  "cosmos-transfer2.5-2b": "nvidia/cosmos-transfer2_5-2b",
  "sd-3.5-large": "stabilityai/stable-diffusion-3_5-large",
  "flux-2-klein-4b": "black-forest-labs/flux_2-klein-4b",
  "stable-diffusion-xl-base": "stabilityai/stable-diffusion-xl-base-1.0",
};

export function getModelContextWindow(modelId: string): number {
  const nimId = ALIAS_TO_NIM[modelId] || modelId;
  return MODEL_CONTEXT_WINDOWS[nimId] || 128000;
}

export function getModelBudget(modelId: string): number {
  return getContextBudget(getModelContextWindow(modelId));
}

export function computeContextBudget(
  messages: TokenMessage[],
  modelId: string,
  pendingMessage?: string,
  pendingFiles?: Array<{ textContent?: string }>
): ContextBudget {
  const totalWindow = getModelContextWindow(modelId);
  const maxTokens = getContextBudget(totalWindow);
  const usedTokens = estimateConversationTokens(messages);

  let pendingTokens = 0;
  if (pendingMessage) {
    pendingTokens += estimateTokens(pendingMessage) + MESSAGE_OVERHEAD;
  }
  if (pendingFiles) {
    for (const file of pendingFiles) {
      if (file.textContent) {
        pendingTokens += estimateTokens(file.textContent) + MESSAGE_OVERHEAD;
      }
    }
  }

  const percentUsed = maxTokens > 0 ? Math.min(100, Math.round((usedTokens / maxTokens) * 100)) : 0;
  const pendingPercent = maxTokens > 0 ? Math.min(100, Math.round((pendingTokens / maxTokens) * 100)) : 0;

  return {
    usedTokens,
    maxTokens,
    totalWindow,
    percentUsed,
    isOverBudget: usedTokens + pendingTokens > maxTokens,
    isNearBudget: percentUsed > 85,
    pendingTokens,
    pendingPercent,
  };
}
