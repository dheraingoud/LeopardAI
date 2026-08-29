"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Curated prompts shown on the empty thread (no LLM call — static list). These
 * replace the plain greeting subline with actionable starting points; a click
 * fills + sends the prompt through the composer (chat.sendMessage).
 */
export const EMPTY_SUGGESTIONS = [
  "Explain a concept",
  "Write code",
  "Research a topic",
  "Draft an email",
] as const;

/**
 * Follow-up prompts shown after a finished assistant turn (status "ready",
 * last message assistant). Cheaply derived — static curated list, no LLM.
 */
export const FOLLOW_UP_SUGGESTIONS = [
  "Explain more",
  "Give an example",
  "Summarize the key points",
] as const;

export interface SuggestionsProps {
  suggestions: readonly string[];
  onSuggestion: (suggestion: string) => void;
  className?: string;
  /** ARIA label for the chip group (also read by assistive tech). */
  label?: string;
}

/**
 * Suggestions — leopard suggestions: a row of
 * clickable prompt pills with a staggered fade-in. Leopard-restyled
 * (DESIGN.md): solid opaque pills with a hairline border, amber accent on
 * hover, no glass. Presentational — the caller owns what a click does.
 */
export function Suggestions({
  suggestions,
  onSuggestion,
  className,
  label = "Suggested prompts",
}: SuggestionsProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex max-w-md flex-wrap justify-center gap-2", className)}
    >
      {suggestions.map((suggestion, index) => (
        <motion.button
          key={suggestion}
          type="button"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: index * 0.05 }}
          onClick={() => onSuggestion(suggestion)}
          className="cursor-pointer rounded-full border px-4 py-2 text-[13px] transition-colors dark:border-white/[0.08] light:border-black/[0.08] dark:bg-[#141414] light:bg-white dark:text-[#e5e5e5] light:text-[#262626] hover:dark:border-[#ffb400]/40 hover:light:border-[#d49600]/40 hover:dark:text-[#ffb400] hover:light:text-[#d49600] hover:dark:bg-[#ffb400]/[0.06] hover:light:bg-[#ffb400]/[0.08] active:scale-[0.97]"
        >
          {suggestion}
        </motion.button>
      ))}
    </div>
  );
}