"use client";

import type { ComponentProps } from "react";
import { ArrowRightIcon, SquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, mono } from "./surfaces";

// Note rendered under an empty assistant bubble after a mid-run stop.
export function StoppedRun({
  reason = "Stopped",
  onContinue,
  onDiscard,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "onContinue" | "onDiscard"
> & {
  reason?: string;
  onContinue?: () => void;
  onDiscard?: () => void;
}) {
  return (
    <div
      data-slot="stopped-run"
      className={cn("flex items-center gap-2", className)}
      {...props}
    >
      <span
        className={cn(
          field,
          mono,
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 dark:text-[#a3a3a3] light:text-[#6b6b6b]",
        )}
      >
        <SquareIcon className="size-2.5 fill-current dark:text-[#ffb400] light:text-[#d49600]" />
        {reason}
      </span>
      {onContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium dark:text-[#a3a3a3] light:text-[#6b6b6b] transition-[background-color,color,scale] duration-150 hover:dark:bg-white/[0.06] hover:light:bg-black/[0.05] hover:dark:text-white hover:light:text-black active:scale-[0.96] motion-reduce:transition-none"
        >
          Continue
          <ArrowRightIcon className="size-3" />
        </button>
      )}
      {onDiscard && (
        <button
          type="button"
          onClick={onDiscard}
          className="flex h-7 items-center rounded-full px-2.5 text-xs font-medium dark:text-[#737373] light:text-[#8a8a8a] transition-[background-color,color,scale] duration-150 hover:dark:bg-white/[0.06] hover:light:bg-black/[0.05] hover:dark:text-white hover:light:text-black active:scale-[0.96] motion-reduce:transition-none"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
