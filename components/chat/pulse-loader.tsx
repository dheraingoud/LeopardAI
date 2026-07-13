"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Shared three-dot pulse loader — consolidates the near-identical loaders
 * previously duplicated in chat-shell.tsx (full-screen "loading chatMeta")
 * and message.tsx (PreviewMessage + ThinkingMessage inline pulsing rows).
 *
 * Behavior is preserved bit-for-bit from the originals via the `size` prop:
 *   - "lg"  : chat-shell centered loader. w-2 h-2 dots, alpha-40 amber,
 *             scale-pulse (0.8 → 1 → 0.8), 1.2s, delay i * 0.2s. No label.
 *   - "sm"  : transcript inline loader. w-[7px] h-[7px] dots, solid amber,
 *             y-pulse (0 → -3 → 0) over alpha (0.25 → 1 → 0.25), 1s,
 *             delay i * 0.15s, easeInOut. Optional muted label.
 *
 * Gap (3px), dot count (3), bg-amber color and `repeat: Infinity` are common
 * — only the size + axis of motion differ between the two call sites.
 *
 * The "sm" variant renders `text-[13px]` for the label by default. The
 * ThinkingMessage site originally used `text-[14px]` — pass `labelSize="md"`
 * to bump the label up to 14px without re-introducing a separate component.
 */
export type PulseLoaderSize = "sm" | "lg";
export type PulseLoaderLabelSize = "sm" | "md";

export interface PulseLoaderProps {
  size?: PulseLoaderSize;
  /** Optional muted label rendered to the right of the dots (size "sm" only). */
  label?: string;
  /** Label font size — defaults to "sm" (13px) to match PreviewMessage. Use
   *  "md" (14px) for ThinkingMessage where the typed label was larger. */
  labelSize?: PulseLoaderLabelSize;
  /** Optional className appended to the dots row wrapper. */
  className?: string;
}

const SIZE_DOT_CLASS: Record<PulseLoaderSize, string> = {
  lg: "w-2 h-2",
  sm: "w-[7px] h-[7px]",
};
void SIZE_DOT_CLASS;

const LABEL_FONT_CLASS: Record<PulseLoaderLabelSize, string> = {
  sm: "text-[13px]",
  md: "text-[14px]",
};

export function PulseLoader({
  size = "lg",
  label,
  labelSize = "sm",
  className,
}: PulseLoaderProps) {
  if (size === "lg") {
    return (
      <div className={cn("flex gap-[3px]", className)}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-[#ffb400]/40"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
     </div>
    );
  }

  // size === "sm": the inline classes below intentionally match the original
  // transcript loader bit-for-bit (w-[7px] h-[7px] rounded-full bg-[#ffb400],
  // animation opacity+y, duration 1, delay i*0.15, easeInOut).
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex gap-[3px]">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-[7px] h-[7px] rounded-full bg-[#ffb400]"
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
     </div>
      {label && (
        <span
          className={cn(
            LABEL_FONT_CLASS[labelSize],
            "dark:text-[#505050] light:text-[#737373]",
          )}
        >
          {label}
       </span>
      )}
   </div>
  );
}
