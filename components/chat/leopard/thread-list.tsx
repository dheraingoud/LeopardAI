"use client";

import type { ComponentProps } from "react";
import { PencilIcon, PinIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";

export interface ThreadListItem {
  id: string;
  title: string;
  time?: string;
  /** Detached generation live on the server → blinking amber dot. */
  generating?: boolean;
  /** Latest activity newer than the user's last open → ringed unread dot. */
  unread?: boolean;
  /** aui pin port (2026-10-10): pinned rows sort above recency in a
   *  "Pinned" bucket + show a pin glyph on hover. */
  pinned?: boolean;
}

// Leopard fork of the kit ThreadList, extended to the production sidebar API:
// grouped sections, active row, hover rename/delete affordances.
export function ThreadList({
  label,
  threads,
  activeId,
  onSelect,
  onRename,
  onDelete,
  onPin,
  editingId,
  editValue,
  onEditChange,
  onEditSubmit,
  onEditCancel,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "label" | "threads" | "activeId" | "onSelect" | "onRename" | "onDelete" | "onPin"
> & {
  label: string;
  threads: readonly ThreadListItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onRename?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Pin/unpin (aui ThreadListItem port 2026-10-10). */
  onPin?: (id: string) => void;
  editingId?: string | null;
  editValue?: string;
  onEditChange?: (value: string) => void;
  onEditSubmit?: () => void;
  onEditCancel?: () => void;
}) {
  return (
    <div
      data-slot="thread-list"
      className={cn("flex w-full flex-col gap-0.5", className)}
      {...props}
    >
      <div className={cn(mono, "text-foreground/35 light:text-foreground/60 px-3 pb-1.5")}>{label}</div>
      {threads.map((thread) => {
        const active = thread.id === activeId;
        if (editingId === thread.id) {
          return (
            <div key={thread.id} className="px-2 py-1.5">
              <input
                autoFocus
                value={editValue ?? ""}
                onChange={(e) => onEditChange?.(e.target.value)}
                onBlur={() => onEditSubmit?.()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onEditSubmit?.();
                  if (e.key === "Escape") onEditCancel?.();
                }}
                className="h-9 w-full rounded-xl bg-transparent px-2 text-sm outline-none ring-1 dark:ring-[#ffb400]/40 light:ring-[#d49600]/40"
              />
            </div>
          );
        }
        return (
          <div
            key={thread.id}
            role="button"
            tabIndex={0}
            aria-current={active || undefined}
            onClick={() => onSelect?.(thread.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(thread.id);
              }
            }}
            className={cn(
              "group relative flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-start text-[13.5px] transition-colors",
              active
                ? "dark:bg-white/[0.08] light:bg-black/[0.05] dark:text-white light:text-[#171717]"
                : "dark:text-[#a3a3a3] light:text-[#525252] hover:dark:bg-white/[0.04] hover:light:bg-black/[0.03]",
            )}
          >
            {active && (
              <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#ffb400]" />
            )}
            <span className="min-w-0 flex-1 truncate">{thread.title}</span>
            {thread.generating ? (
              <span
                role="status"
                title="Generating…"
                className="size-1.5 shrink-0 animate-pulse rounded-full bg-[#ffb400]"
              />
            ) : thread.unread ? (
              // Audit 2026-10-10: unread used to be a bare dot — same shape +
              // stillness as generating's amber pulse read identically for
              // color-blind users. Ringed outline reads as "marker", not
              // "activity".
              <span
                role="status"
                title="Unread"
                aria-label="Unread"
                className="size-1.5 shrink-0 rounded-full border dark:border-white/70 light:border-black/60 dark:bg-transparent light:bg-transparent"
              />
            ) : null}
            {thread.time && (
              <span
                className={cn(
                  mono,
                  "text-foreground/35 light:text-foreground/60 tabular-nums group-hover:hidden",
                )}
              >
                {thread.time}
              </span>
            )}
            {/* Pin (aui ThreadListItem port 2026-10-10): pinned rows show the
                pin at rest (not just on hover) so the affordance reads. */}
            {thread.pinned && (
              <button
                type="button"
                aria-label="Unpin chat"
                title="Unpin"
                className="shrink-0 rounded-full p-1 text-[#ffb400] dark:text-[#ffb400] light:text-[#d49600]"
                onClick={(e) => {
                  e.stopPropagation();
                  onPin?.(thread.id);
                }}
              >
                <PinIcon className="size-3 fill-current" />
              </button>
            )}
            <span className="hidden items-center gap-0.5 group-hover:flex">
              {!thread.pinned && (
                <button
                  type="button"
                  aria-label="Pin chat"
                  title="Pin"
                  className="text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground/90 rounded-full p-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPin?.(thread.id);
                  }}
                >
                  <PinIcon className="size-3" />
                </button>
              )}
              <button
                type="button"
                aria-label="Rename chat"
                className="text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground/90 rounded-full p-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onRename?.(thread.id);
                }}
              >
                <PencilIcon className="size-3" />
              </button>
              <button
                type="button"
                aria-label="Delete chat"
                className="text-foreground/45 hover:bg-foreground/[0.06] hover:text-red-400 rounded-full p-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(thread.id);
                }}
              >
                <Trash2Icon className="size-3" />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
