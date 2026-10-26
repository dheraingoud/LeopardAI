"use client";

import type { QuoteInfo } from "@/leopard-ui/core";
import { getMessageQuote } from "@/leopard-ui/core/react";
import { useLeopardState } from "@/leopard-ui/store";

/**
 * Hook that returns the quote info for the current message, if any.
 *
 * Reads from `message.metadata.custom.quote`.
 *
 * @example
 * ```tsx
 * function QuoteBlock() {
 *   const quote = useMessageQuote();
 *   if (!quote) return null;
 *   return <blockquote>{quote.text}</blockquote>;
 * }
 * ```
 */
export const useMessageQuote = (): QuoteInfo | undefined => {
  return useLeopardState(getMessageQuote);
};
