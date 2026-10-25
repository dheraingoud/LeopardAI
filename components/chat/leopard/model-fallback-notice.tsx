"use client";

import { AlertTriangleIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

export function ModelFallbackNotice({
  from,
  to,
  onDismiss,
  className,
}: {
  from: string;
  to: string;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <div
      data-slot="model-fallback-notice"
      role="alert"
      className={cn(
        paper,
        "mb-3 flex w-full items-start gap-2.5 rounded-[18px] px-3.5 py-2.5",
        className,
      )}
    >
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400">
        <AlertTriangleIcon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug font-medium">
          {from} is unreachable — sent to {to} instead.
        </p>
        <p className="text-foreground/55 mt-0.5 text-[11.5px] leading-snug">
          Your message went through. Health can lag behind a real outage —
          re-check from the model picker.
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss model fallback notice"
        onClick={onDismiss}
        className="text-foreground/35 hover:text-foreground/70 -mt-0.5 shrink-0 rounded p-1 transition-colors"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
