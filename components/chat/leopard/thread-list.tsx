"use client";

import type { ComponentProps } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";

export interface ThreadListItem {
  id: string;
  title: string;
  time?: string;
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
  editingId,
  editValue,
  onEditChange,
  onEditSubmit,
  onEditCancel,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "label" | "threads" | "activeId" | "onSelect" | "onRename" | "onDelete"
> & {
  label: string;
  threads: readonly ThreadListItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onRename?: (id: string) => void;
  onDelete?: (id: string) => void;
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
      <div className={cn(mono, "text-foreground/35 px-3 pb-1.5")}>{label}</div>
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
                className="h-9 w-full rounded-md bg-transparent px-2 text-sm outline-none ring-1 dark:ring-[#ffb400]/40 light:ring-[#d49600]/40"
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
              "group relative flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-start text-[13.5px] transition-colors",
              active
                ? "dark:bg-white/[0.08] light:bg-black/[0.05] dark:text-white light:text-[#171717]"
                : "dark:text-[#a3a3a3] light:text-[#525252] hover:dark:bg-white/[0.04] hover:light:bg-black/[0.03]",
            )}
          >
            {active && (
              <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#ffb400]" />
            )}
            <span className="min-w-0 flex-1 truncate">{thread.title}</span>
            {thread.time && (
              <span
                className={cn(
                  mono,
                  "text-foreground/35 tabular-nums group-hover:hidden",
                )}
              >
                {thread.time}
              </span>
            )}
            <span className="hidden items-center gap-0.5 group-hover:flex">
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
