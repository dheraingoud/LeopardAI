"use client";

import { useCallback, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { BrainIcon, XIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { field, ghostButton, mono, paper } from "./surfaces";

// Composer memory chip → popover of forked chips, one per remembered fact,
// each with one-click forget. Same Convex userMemory store the route injects
// into the system prompt. Hidden unless NEXT_PUBLIC_LEOPARD_MEMORY=1 or ?mem=1.

const UI_ENABLED =
  process.env.NEXT_PUBLIC_LEOPARD_MEMORY === "1" ||
  (typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mem") === "1");

export function MemoryChips() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const userId = user?.id;

  const memories = useQuery(api.userMemory.listMine, userId ? { userId } : "skip");
  const forgetMemory = useMutation(api.userMemory.forget);

  const onForget = useCallback(
    async (memoryId: Id<"userMemory">) => {
      if (!userId) return;
      try {
        await forgetMemory({ memoryId, userId });
      } catch {
        /* mutation throws on failure; keep the row visible */
      }
    },
    [userId, forgetMemory],
  );

  const count = memories?.length ?? 0;
  if (!UI_ENABLED || !userId || count === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        title={`${count} thing${count === 1 ? "" : "s"} Leopard remembers about you`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "grid h-6 items-center gap-0.5 rounded-full px-1.5 font-mono text-[10px] tracking-tight",
          field,
          "ring-1 transition dark:text-[#ffb400]/80 light:text-[#d49600]",
          open
            ? "dark:ring-[#ffb400]/40 light:ring-[#d49600]/40"
            : "dark:ring-[#ffb400]/20 light:ring-[#d49600]/20 hover:dark:ring-[#ffb400]/40 hover:light:ring-[#d49600]/40",
        )}
        style={{ gridTemplateColumns: "auto auto" }}
      >
        <BrainIcon className="size-3" strokeWidth={1.5} />
        <span>{count}</span>
      </button>

      {open && (
        <div className="absolute right-0 bottom-9 z-40 w-72 max-w-[80vw]">
          <div className={cn(paper, "overflow-hidden rounded-2xl dark:shadow-[0_16px_48px_rgba(0,0,0,0.5)] light:shadow-[0_16px_48px_rgba(0,0,0,0.18)]")}>
            <div className="flex items-center justify-between border-b px-3 py-2 dark:border-white/[0.06] light:border-black/[0.06]">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] dark:text-[#ffb400]/70 light:text-[#d49600]">
                Memory
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className={cn(ghostButton, "size-5")}
              >
                <XIcon className="size-3.5" strokeWidth={1.5} />
              </button>
            </div>
            <div data-slot="memory-chips" className="flex max-h-72 flex-wrap gap-1.5 overflow-y-auto p-3">
              {memories?.map((m) => (
                <span
                  key={m._id}
                  className={cn(
                    "group flex items-center gap-1 rounded-full py-1 pr-1 pl-2.5 text-xs",
                    field,
                    "dark:text-[#c9c9c9] light:text-[#4a4a4a]",
                  )}
                >
                  {m.pinned && (
                    <span className="rounded px-1 text-[9px] font-semibold uppercase tracking-wider dark:bg-[#ffb400]/15 dark:text-[#ffb400] light:bg-[#d49600]/15 light:text-[#d49600]">
                      pinned
                    </span>
                  )}
                  {m.text}
                  <button
                    type="button"
                    aria-label={`Forget "${m.text}"`}
                    title="Forget this"
                    onClick={() => onForget(m._id)}
                    className={cn(ghostButton, "size-4 hover:dark:text-red-300 hover:light:text-red-500")}
                  >
                    <XIcon className="size-2.5" />
                  </button>
                </span>
              ))}
              {(!memories || memories.length === 0) && (
                <span className={cn(mono, "px-1 py-1 dark:text-[#6a6a6a] light:text-[#8a8a8a]")}>
                  No memories yet.
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
