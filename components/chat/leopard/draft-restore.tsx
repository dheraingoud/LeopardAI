// Leopard fork of the elements kit draft-restore: unsent-draft persistence +
// restore banner. localStorage-backed, keyed per chat.
"use client";

import type { ComponentProps } from "react";
import { useCallback, useEffect, useState } from "react";
import { PencilLineIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostButton, mono, paper } from "./surfaces";

const keyFor = (chatId: string) => `leopard-draft-${chatId}`;

// Persist the in-progress composer text: hydrate on mount/chat switch, write
// on every change, drop the key when the draft empties (i.e. on send).
export function useDraftRestore(chatId: string) {
  const key = keyFor(chatId);
  const [draft, setDraftState] = useState("");

  useEffect(() => {
    setDraftState(window.localStorage.getItem(key) ?? "");
  }, [key]);

  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);
      if (value === "") window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    },
    [key],
  );

  return { draft, setDraft };
}

export function DraftRestore({
  draft,
  savedAt,
  onRestore,
  onDiscard,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "draft" | "savedAt" | "onRestore" | "onDiscard"
> & {
  draft: string;
  savedAt: string;
  onRestore?: () => void;
  onDiscard?: () => void;
}) {
  return (
    <div
      data-slot="draft-restore"
      className={cn(
        paper,
        "fade-in slide-in-from-bottom-1 animate-in flex w-full max-w-sm items-center gap-2.5 rounded-2xl py-2 pr-2 pl-3.5 duration-300",
        className,
      )}
      {...props}
    >
      <PencilLineIcon className="text-foreground/30 size-3.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-foreground/70 truncate text-[13px]">{draft}</span>
        <span className={cn(mono, "text-foreground/30")}>
          unsent draft · {savedAt}
        </span>
      </div>
      <button
        type="button"
        onClick={onRestore}
        className="text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground/95 shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96]"
      >
        Restore
      </button>
      <button
        type="button"
        aria-label="Discard the draft"
        onClick={onDiscard}
        className={cn(ghostButton, "size-7 shrink-0")}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
