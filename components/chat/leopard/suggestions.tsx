"use client";

import { motion } from "framer-motion";
import { CodeIcon, GlobeIcon, PenLineIcon, SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Follow-up prompts shown after a finished assistant turn (status "ready",
 * last message assistant). Cheaply derived — static curated list, no LLM.
 */
export const FOLLOW_UP_SUGGESTIONS = [
  "Explain more",
  "Give an example",
  "Summarize the key points",
] as const;

/** ChatGPT-style empty-state rows: icon + action label, one per line. */
const SUGGESTION_ROWS = [
  { icon: SparklesIcon, label: "Explain a concept", prompt: "Explain a concept: " },
  { icon: CodeIcon, label: "Write code", prompt: "Write code that " },
  { icon: GlobeIcon, label: "Research a topic", prompt: "Research " },
  { icon: PenLineIcon, label: "Draft an email", prompt: "Draft an email " },
] as const;

export function SuggestionRows({
  onSuggestion,
  className,
}: {
  onSuggestion: (prompt: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full max-w-xs flex-col items-stretch gap-0.5", className)}>
      {SUGGESTION_ROWS.map(({ icon: Icon, label, prompt }, index) => (
        <motion.button
          key={label}
          type="button"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: index * 0.05 }}
          onClick={() => onSuggestion(prompt)}
          className="group flex items-center gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors dark:text-[#a3a3a3] light:text-[#525252] hover:dark:bg-white/[0.05] hover:light:bg-black/[0.04] hover:dark:text-white hover:light:text-black active:scale-[0.99]"
        >
          <Icon className="size-4 shrink-0 dark:text-[#737373] light:text-[#8a8a8a] transition-colors group-hover:dark:text-[#ffb400] group-hover:light:text-[#d49600]" />
          {label}
        </motion.button>
      ))}
    </div>
  );
}

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