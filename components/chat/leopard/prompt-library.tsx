// Leopard fork of the elements kit prompt-library: saved-prompt picker.
// Presentational list only — not wired anywhere yet.
"use client";

import type { ComponentProps } from "react";
import { BookmarkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";

export interface PromptItem {
  slug: string;
  title: string;
  description: string;
}

export function PromptLibrary({
  prompts,
  onPick,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "onSelect"> & {
  prompts: readonly PromptItem[];
  onPick?: (prompt: PromptItem) => void;
}) {
  return (
    <div
      data-slot="prompt-library"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-0.5 rounded-2xl p-2",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2 px-2 pt-1 pb-1.5">
        <BookmarkIcon className="text-foreground/30 size-3.5 shrink-0" />
        <span className={cn(mono, "text-foreground/35")}>saved prompts</span>
      </div>

      {prompts.map((prompt) => (
        <button
          key={prompt.slug}
          type="button"
          onClick={() => onPick?.(prompt)}
          className="hover:bg-foreground/[0.04] flex flex-col gap-0.5 rounded-xl px-2 py-1.5 text-start transition-colors"
        >
          <span className="text-foreground/85 truncate text-[13px]">
            {prompt.title}
          </span>
          <span className="text-foreground/45 truncate text-xs">
            {prompt.description}
          </span>
        </button>
      ))}

      {prompts.length === 0 && (
        <span className="text-foreground/30 block px-2 py-3 text-center text-xs">
          No saved prompts yet
        </span>
      )}
    </div>
  );
}
