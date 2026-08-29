"use client";

import { AlertTriangleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, inkButton, mono, paper } from "./surfaces";

// Inline editor that REPLACES a user bubble while editing (message.tsx mounts
// it only in edit mode). Textarea + Cancel/Save; `discardedReplies` warns how
// many later replies the resend discards. Cmd/Ctrl+Enter saves, Esc cancels.
export function EditMessage({
  value,
  discardedReplies,
  onValueChange,
  onSave,
  onCancel,
  className,
}: {
  value: string;
  discardedReplies: number;
  onValueChange?: (value: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  className?: string;
}) {
  return (
    <div
      data-slot="edit-message"
      className={cn(
        paper,
        "flex w-full flex-col gap-3 rounded-[20px] p-3.5",
        className,
      )}
    >
      <textarea
        autoFocus
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSave?.();
          } else if (event.key === "Escape") {
            onCancel?.();
          }
        }}
        rows={Math.min(10, Math.max(2, value.split("\n").length))}
        aria-label="Edit your message"
        className={cn(
          field,
          "resize-none rounded-xl px-3 py-2.5 text-[13.5px] leading-relaxed outline-none dark:text-[#e5e5e5] light:text-[#262626] focus-visible:ring-1 focus-visible:ring-[#ffb400]/40",
        )}
      />

      {discardedReplies > 0 && (
        <div className="flex items-center gap-2 dark:text-[#ffb400] light:text-[#d49600]">
          <AlertTriangleIcon className="size-3.5 shrink-0" />
          <span className={cn(mono, "tabular-nums")}>
            resending discards {discardedReplies}{" "}
            {discardedReplies === 1 ? "reply" : "replies"}
          </span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-full px-3.5 text-xs font-medium dark:text-[#a3a3a3] light:text-[#525252] transition-[background-color,color,scale] duration-150 hover:dark:bg-white/[0.06] hover:light:bg-black/[0.04] hover:dark:text-white hover:light:text-black active:scale-[0.96]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className={cn(
            inkButton,
            "flex h-8 items-center rounded-full px-3.5 text-xs font-medium",
          )}
        >
          Save &amp; resend
        </button>
      </div>
    </div>
  );
}
