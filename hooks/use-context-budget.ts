"use client";

import { useMemo } from "react";
import { computeContextBudget, type ContextBudget, type TokenMessage } from "@/lib/token-estimator";

export type { ContextBudget };

interface UseContextBudgetOptions {
  messages: TokenMessage[];
  modelId: string;
  pendingMessage?: string;
  pendingFiles?: Array<{ textContent?: string }>;
}

const EMPTY_BUDGET: ContextBudget = {
  usedTokens: 0,
  maxTokens: 0,
  totalWindow: 0,
  percentUsed: 0,
  isOverBudget: false,
  isNearBudget: false,
  pendingTokens: 0,
  pendingPercent: 0,
};

export function useContextBudget({
  messages,
  modelId,
  pendingMessage,
  pendingFiles,
}: UseContextBudgetOptions): ContextBudget {
  return useMemo(
    () => computeContextBudget(messages, modelId, pendingMessage, pendingFiles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      messages,
      modelId,
      pendingMessage,
      pendingFiles?.map((f) => f.textContent?.length).join(","),
    ]
  );
}

export function useContextBudgetLight(modelId: string): ContextBudget {
  return useMemo(() => computeContextBudget([], modelId), [modelId]);
}

export { EMPTY_BUDGET };
