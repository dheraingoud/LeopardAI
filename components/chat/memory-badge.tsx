"use client";

// Φ-docs · per-user long-term memory — compose-area affordance.
//
// A small amber chip beside the composer (next to the context ring) showing how
// many durable facts Leopard remembers about the signed-in user. Click/toggle →
// a glass panel lists each memory with one-click delete (same storage the route
// injects into the system prompt when LEOPARD_MEMORY=1).
//
// Renders nothing while signed out, and nothing unless the operator has the
// feature on: NEXT_PUBLIC_LEOPARD_MEMORY=1, or the URL carries ?mem=1 (a dev
// escape hatch so the UI can be previewed without an env change).

import { useState, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Brain, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";

const UI_ENABLED =
  process.env.NEXT_PUBLIC_LEOPARD_MEMORY === "1" ||
  (typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mem") === "1");

export function MemoryBadge() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const userId = user?.id;

  // Convex skips the request when signed out → hooks return undefined, no render.
  const memories = useQuery(api.userMemory.listMine, userId ? { userId } : "skip");
  const deleteMemory = useMutation(api.userMemory.forget);

  const onDelete = useCallback(
    async (memoryId: Id<"userMemory">) => {
      if (!userId) return;
      try {
        await deleteMemory({ memoryId, userId });
      } catch {
        /* mutation throws on failure; keep the row visible */
      }
    },
    [userId, deleteMemory],
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
          "grid h-6 items-center gap-0.5 rounded-full px-1.5",
          "bg-white/[0.03] ring-1 font-mono text-[10px] tracking-tight text-amber-200/80",
          "transition hover:text-amber-100",
          open ? "ring-amber-300/40" : "ring-amber-300/20 hover:ring-amber-300/40",
        )}
        style={{ gridTemplateColumns: "auto auto" }}
      >
        <Brain className="h-3 w-3" strokeWidth={1.5} />
        <span>{count}</span>
      </button>

      {open && (
        <div className="absolute bottom-9 right-0 z-40 w-72 max-w-[80vw]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/90 shadow-xl shadow-black/40 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-amber-200/70">
                Memory
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="text-[#b6b6b6] transition hover:text-white"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
            <ul className="max-h-72 divide-y divide-white/5 overflow-y-auto">
              {memories?.map((m) => (
                <li key={m._id} className="group flex items-start gap-2 px-3 py-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/70" />
                  <p className="min-w-0 flex-1 text-[12px] leading-snug text-[#eaeaea]">
                    {m.pinned && (
                      <span className="mr-1 rounded bg-amber-300/15 px-1 text-[9px] font-semibold uppercase tracking-wider text-amber-200">
                        pinned
                      </span>
                    )}
                    {m.text}
                  </p>
                  <button
                    type="button"
                    aria-label="Forget this"
                    title="Forget this"
                    onClick={() => onDelete(m._id)}
                    className="mt-0.5 shrink-0 text-[#6f6f6f] transition hover:text-red-300"
                  >
                    <X className="h-3 w-3" strokeWidth={1.5} />
                  </button>
                </li>
              ))}
              {(!memories || memories.length === 0) && (
                <li className="px-3 py-3 text-[12px] text-[#8a8a8a]">
                  No memories yet.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}