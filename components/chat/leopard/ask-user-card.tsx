"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { mono, paper, field } from "./surfaces";

// AskUser option card: the model's structured clarifying question renders as
// clickable options instead of a binary Allow/Deny gate. Choosing an option
// resumes the turn with the choice as the tool's answer. Leopard's structured-
// question surface (replaces the ask-user prose round-trip).
export function AskUserCard({
  question,
  options,
  onPick,
  onSkip,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "onPick" | "onSkip"> & {
  question: string;
  options: readonly string[];
  onPick: (choice: string) => void;
  onSkip?: () => void;
}) {
  return (
    <div
      data-slot="ask-user-card"
      // a11y: a blocking decision — the dialog pattern (label + focus).
      role="alertdialog"
      aria-label="Question"
      tabIndex={-1}
      ref={(el) => el?.focus()}
      className={cn(paper, "flex w-full flex-col gap-3.5 rounded-2xl p-4 outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/40", className)}
      {...props}
    >
      <p className="text-[13.5px] font-medium dark:text-[#e8e8e8] light:text-[#1f1607]">
        {question}
      </p>
      <div className="flex flex-col gap-1.5" role="group" aria-label="Options">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onPick(option)}
            className={cn(
              field,
              "flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-start text-[13px] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/50 dark:text-[#d4d4d4] light:text-[#404040] dark:hover:bg-white/[0.07] light:hover:bg-black/[0.055]",
            )}
          >
            <span className={cn(mono, "dark:text-[#ffb400] light:text-[#d49600] shrink-0")}>
              →
            </span>
            <span className="min-w-0 flex-1">{option}</span>
          </button>
        ))}
      </div>
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className={cn(
            mono,
            "self-start rounded-full px-2.5 py-1 text-[11px] transition-colors dark:text-[#737373] light:text-[#8a8a8a] dark:hover:bg-white/[0.06] light:hover:bg-black/[0.05] dark:hover:text-white light:hover:text-black outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/40",
          )}
        >
          Skip — you decide
        </button>
      )}
    </div>
  );
}
