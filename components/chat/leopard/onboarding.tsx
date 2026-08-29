"use client";

import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { field, inkButton, mono, paper } from "./surfaces";
import { indexIn } from "./range";

export interface OnboardingStep {
  title: string;
  body: string;
  example: string;
}

export function Onboarding({
  steps,
  index,
  onNext,
  onSkip,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "steps" | "index" | "onNext" | "onSkip"
> & {
  steps: readonly OnboardingStep[];
  index: number;
  onNext?: () => void;
  onSkip?: () => void;
}) {
  const current = indexIn(steps, index);
  const step = steps[current];
  if (!step) return null;
  const last = current >= steps.length - 1;

  return (
    <div
      data-slot="onboarding"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-4 rounded-[20px] p-5",
        className,
      )}
      {...props}
    >
      <div
        key={current}
        className="fade-in animate-in flex flex-col gap-2 duration-300"
      >
        <span
          className={cn(
            mono,
            "tabular-nums dark:text-[#525252] light:text-[#a3a3a3]",
          )}
        >
          {current + 1} of {steps.length}
        </span>
        <span className="text-[15px] font-medium tracking-tight dark:text-[#e5e5e5] light:text-[#262626]">
          {step.title}
        </span>
        <p className="text-[13px] leading-relaxed break-words dark:text-[#8c8c8c] light:text-[#595959]">
          {step.body}
        </p>
        <span
          className={cn(
            field,
            "rounded-xl px-3 py-2 text-[13px] leading-relaxed dark:text-[#a3a3a3] light:text-[#525252]",
          )}
        >
          {step.example}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="flex gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "h-1 rounded-full transition-all duration-300 motion-reduce:transition-none",
                i === current
                  ? "w-4 bg-[#ffb400] light:bg-[#d49600]"
                  : "w-1 dark:bg-white/[0.12] light:bg-black/[0.12]",
              )}
            />
          ))}
        </span>

        <button
          type="button"
          onClick={onSkip}
          className="ms-auto h-8 rounded-full px-3 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96] dark:text-[#737373] light:text-[#8c8c8c] dark:hover:bg-white/[0.06] light:hover:bg-black/[0.05] dark:hover:text-[#e5e5e5] light:hover:text-[#262626]"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={onNext}
          className={cn(
            inkButton,
            "flex h-8 items-center rounded-full px-3.5 text-xs font-medium",
          )}
        >
          {last ? "Start" : "Next"}
        </button>
      </div>
    </div>
  );
}

// First-run tour, shown once until the flag lands in localStorage.
const ONBOARDED_KEY = "leopard-onboarded";

const FIRST_RUN_STEPS: readonly OnboardingStep[] = [
  {
    title: "Pick a model, ask anything",
    body: "Leopard streams answers from your selected model. Switch models any time from the composer picker.",
    example: "Try: explain transformers like I'm five",
  },
  {
    title: "Slash commands and mentions",
    body: "Type / for quick actions or @ to reference a recent conversation — the composer autocompletes both.",
    example: "/summarize  ·  @my earlier chat",
  },
  {
    title: "Enter sends, Shift+Enter breaks",
    body: "That's the default. Flip it any time under Settings → Models if you prefer Enter for newlines.",
    example: "Settings → Send with Enter",
  },
];

export function FirstRunOnboarding({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARDED_KEY)) setVisible(true);
    } catch {
      /* storage blocked — stay hidden */
    }
  }, []);

  if (!visible) return null;

  const finish = () => {
    try {
      localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      /* non-fatal */
    }
    setVisible(false);
  };

  return (
    <Onboarding
      steps={FIRST_RUN_STEPS}
      index={index}
      onNext={() => (index >= FIRST_RUN_STEPS.length - 1 ? finish() : setIndex(index + 1))}
      onSkip={finish}
      className={className}
    />
  );
}
