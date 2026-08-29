"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { mono, ShimmerLabel } from "./surfaces";
import { TypingIndicator } from "./typing-indicator";

// Composite for ThinkingMessage (message.tsx mounts this): the dots bubble
// beside the shimmer label.
export function ThinkingBubble({
  label,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & { label: string }) {
  return (
    <div
      data-slot="thinking-bubble"
      className={cn("flex items-center gap-3", className)}
      {...props}
    >
      <TypingIndicator variant="bubble" />
      <ThinkingIndicator label={label} />
    </div>
  );
}

export function ThinkingIndicator({
  label,
  elapsed,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "label" | "elapsed"> & {
  label: string;
  elapsed?: string;
}) {
  return (
    <div
      data-slot="thinking-indicator"
      className={cn(
        "text-foreground/55 flex items-center gap-2.5 text-sm",
        className,
      )}

      {...props}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 animate-pulse rounded-full dark:bg-[#ffb400] light:bg-[#d49600] motion-reduce:animate-none"
      />
      <ShimmerLabel
        key={label}
        className="fade-in slide-in-from-bottom-1 animate-in relative inline-block leading-none duration-300"
      >
        {label}
      </ShimmerLabel>
      {elapsed !== undefined && (
        <span className={cn(mono, "text-foreground/30 tabular-nums")}>
          {elapsed}
        </span>
      )}
    </div>
  );
}
