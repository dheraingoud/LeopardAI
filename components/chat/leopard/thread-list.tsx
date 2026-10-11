"use client";

import type { ComponentProps } from "react";
import { memo } from "react";
import { ArchiveIcon, PencilIcon, PinIcon, Trash2Icon } from "lucide-react";
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
  /** Pinned rows sort above recency in a
   *  "Pinned" bucket + show a pin glyph on hover. */
  pinned?: boolean;
  /** Archived rows hide unless the sidebar's
   *  "show archived" chip is on; the row's archive button then unarchives. */
  archived?: boolean;
}

// Leopard fork of the kit ThreadList, extended to the production sidebar API:
// grouped sections, active row, hover rename/delete affordances.
export const ThreadList = memo(function ThreadList({
  label,
  threads,
  activeId,
  onSelect,
  onRename,
  onDelete,
  onPin,
  onArchive,
  editingId,
  editValue,
  onEditChange,
  onEditSubmit,
  onEditCancel,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "label" | "threads" | "activeId" | "onSelect" | "onRename" | "onDelete" | "onPin" | "onArchive"
> & {
  label: string;
  threads: readonly ThreadListItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onRename?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Pin/unpin. */
  onPin?: (id: string) => void;
  /** Archive: hides from the
   *  sidebar; the chat stays in the DB and a direct link still loads it. */
  onArchive?: (id: string) => void;
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
            {/* Title gets the full row width — the status dot + actions are
                absolutely pinned at the trailing edge so they never truncate
                the title early. */}
            <span className="min-w-0 flex-1 truncate">{thread.title}</span>
            {/* Unread is a filled amber dot (subtle, not a hollow ring); the
                generating pulse keeps its own motion. Both read as state, not
                clutter. */}
            {(thread.generating || thread.unread) && (
              <span
                role="status"
                title={thread.generating ? "Generating…" : "Unread"}
                aria-label={thread.generating ? "Generating" : "Unread"}
                className={cn(
                  "absolute right-3 top-1/2 size-1.5 shrink-0 -translate-y-1/2 rounded-full bg-[#ffb400] transition-opacity",
                  thread.generating ? "animate-pulse" : "opacity-80",
                  "group-hover:opacity-0",
                )}
              />
            )}
            {thread.time && !thread.generating && !thread.unread && (
              <span
                className={cn(
                  mono,
                  "text-foreground/35 light:text-foreground/60 tabular-nums group-hover:hidden",
                )}
              >
                {thread.time}
              </span>
            )}
            {/* Pinned rows read as pinned via the bucket they're in — no
                at-rest pin icon (it ate the title's width). Hover/focus
                reveals the action set as an overlay at the trailing edge, so
                the title keeps the full row width. */}
            <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-lg pl-6 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-[linear-gradient(to_right,transparent,black_30%)] light:bg-[linear-gradient(to_right,transparent,white_30%)]">
              <button
                type="button"
                aria-label={thread.pinned ? "Unpin chat" : "Pin chat"}
                title={thread.pinned ? "Unpin" : "Pin"}
                className={cn(
                  "rounded-full p-1 hover:bg-foreground/[0.08]",
                  thread.pinned
                    ? "text-[#ffb400] dark:text-[#ffb400] light:text-[#d49600]"
                    : "text-foreground/45 hover:text-foreground/90",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onPin?.(thread.id);
                }}
              >
                <PinIcon className={cn("size-3", thread.pinned && "fill-current")} />
              </button>
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
                aria-label={thread.archived ? "Unarchive chat" : "Archive chat"}
                title={thread.archived ? "Unarchive" : "Archive"}
                className="text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground/90 rounded-full p-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive?.(thread.id);
                }}
              >
                <ArchiveIcon className="size-3" />
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
});
