"use client";

import { Fragment, useMemo, useState, type ComponentProps } from "react";
import {
  ArchiveIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldInteractive, mono } from "../surfaces";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Presentational thread list: search + date grouping (Today/Yesterday/
// Earlier) + inline rename + row overflow menu. Runtime arrives as props.

export type ThreadListEntry = {
  id: string;
  title: string;
  at?: Date;
  active?: boolean;
  running?: boolean;
};

export type ThreadListProps = Omit<ComponentProps<"div">, "onSelect"> & {
  threads: readonly ThreadListEntry[];
  loading?: boolean;
  onNew?: () => void;
  onSelect?: (id: string) => void;
  onRename?: (id: string, title: string) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
};

const DAY_MS = 86_400_000;

function groupLabel(at: Date | undefined, startOfToday: number) {
  if (!at || at.getTime() >= startOfToday) return "Today";
  if (at.getTime() >= startOfToday - DAY_MS) return "Yesterday";
  return "Earlier";
}

export function ThreadList({
  threads,
  loading = false,
  onNew,
  onSelect,
  onRename,
  onArchive,
  onDelete,
  className,
  ...props
}: ThreadListProps) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const groups = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const filtered = threads
      .filter((t) => !query || t.title.toLowerCase().includes(query))
      .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
    const out: { label: string; items: ThreadListEntry[] }[] = [];
    for (const item of filtered) {
      const label = groupLabel(item.at, startOfToday);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(item);
      else out.push({ label, items: [item] });
    }
    return out;
  }, [threads, query]);

  return (
    <div
      data-slot="thread-list"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    >
      <button
        type="button"
        onClick={onNew}
        className={cn(
          fieldInteractive,
          "flex h-8 items-center gap-2 rounded-md px-2.5 text-sm",
        )}
      >
        <PlusIcon className="size-4 shrink-0" />
        <span className="whitespace-nowrap">New Thread</span>
      </button>

      {threads.length > 0 && (
        <div className="relative px-0.5 py-1">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search threads"
            placeholder="Search threads"
            className={cn(
              fieldInteractive,
              "h-8 w-full rounded-md ps-8 pe-2 text-sm outline-none",
            )}
          />
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-0.5" role="status" aria-label="Loading threads">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex h-8 items-center px-2.5">
              <div className="bg-foreground/[0.06] h-3.5 w-full animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="text-muted-foreground px-2.5 py-4 text-sm">
          No threads found
        </div>
      ) : (
        groups.map((group) => (
          <Fragment key={group.label}>
            <div className={cn(mono, "px-2.5 pt-3 pb-1 text-foreground/40")}>
              {group.label}
            </div>
            {group.items.map((item) => (
              <ThreadListRow
                key={item.id}
                item={item}
                onSelect={onSelect}
                onRename={onRename}
                onArchive={onArchive}
                onDelete={onDelete}
              />
            ))}
          </Fragment>
        ))
      )}
    </div>
  );
}

function ThreadListRow({
  item,
  onSelect,
  onRename,
  onArchive,
  onDelete,
}: {
  item: ThreadListEntry;
  onSelect?: (id: string) => void;
  onRename?: (id: string, title: string) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(item.title);

  const commit = () => {
    setRenaming(false);
    const next = value.trim();
    if (next && next !== item.title) onRename?.(item.id, next);
  };

  return (
    <div
      data-slot="thread-list-item"
      data-active={item.active || undefined}
      className={cn(
        "group relative flex h-8 items-center rounded-md transition-colors",
        "hover:bg-foreground/[0.05] data-active:bg-foreground/[0.06]",
      )}
    >
      {renaming ? (
        <input
          autoFocus
          aria-label="Rename thread"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setRenaming(false);
          }}
          className={cn(fieldInteractive, "h-7 min-w-0 flex-1 rounded px-2.5 text-sm outline-none")}
        />
      ) : (
        <button
          type="button"
          onClick={() => onSelect?.(item.id)}
          className="flex h-full min-w-0 flex-1 items-center rounded-md px-2.5 text-start text-sm outline-none group-hover:pe-9"
        >
          {item.running && (
            <Loader2Icon aria-hidden className="me-1.5 size-3.5 shrink-0 animate-spin dark:text-[#ffb400] light:text-[#d49600]" />
          )}
          <span className="min-w-0 flex-1 truncate">{item.title}</span>
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More options"
          className="absolute end-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded opacity-0 outline-none transition-opacity group-hover:opacity-100 data-[popup-open]:opacity-100 hover:bg-foreground/[0.07]"
        >
          <MoreHorizontalIcon className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={6}>
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <PencilIcon className="size-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onArchive?.(item.id)}>
            <ArchiveIcon className="size-4" /> Archive
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-400"
            onClick={() => onDelete?.(item.id)}
          >
            <TrashIcon className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
