"use client";

import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { CheckIcon, CloudOffIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";

export type ConnectionPhase = "online" | "dropped" | "reconnecting" | "resumed";

export function ConnectionState({
  phase,
  attempt,
  resumedTokens,
  onRetry,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "phase" | "attempt" | "resumedTokens" | "onRetry"
> & {
  phase: ConnectionPhase;
  attempt?: number;
  resumedTokens?: number;
  onRetry?: () => void;
}) {
  if (phase === "online") return null;

  return (
    <div
      data-slot="connection-state"
      className={cn(
        paper,
        "fade-in slide-in-from-top-1 animate-in flex w-full max-w-sm items-center gap-2.5 rounded-2xl px-3.5 py-2.5 duration-300",
        className,
      )}
      {...props}
    >
      {phase === "dropped" && (
        <>
          <CloudOffIcon className="size-3.5 shrink-0 dark:text-[#ffb400] light:text-[#d49600]" />
          <span className="min-w-0 flex-1 text-[13px] dark:text-[#d4d4d4] light:text-[#404040]">
            Connection lost. The run kept going on the server.
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96] dark:text-[#a3a3a3] light:text-[#525252] dark:hover:bg-white/[0.06] light:hover:bg-black/[0.05] dark:hover:text-white light:hover:text-black"
          >
            Reconnect
          </button>
        </>
      )}

      {phase === "reconnecting" && (
        <>
          <Loader2Icon className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none dark:text-[#737373] light:text-[#8c8c8c]" />
          <span className="min-w-0 flex-1 text-[13px] dark:text-[#d4d4d4] light:text-[#404040]">
            Reconnecting
          </span>
          {attempt !== undefined && (
            <span
              className={cn(
                mono,
                "shrink-0 tabular-nums dark:text-[#525252] light:text-[#a3a3a3]",
              )}
            >
              attempt {attempt}
            </span>
          )}
        </>
      )}

      {phase === "resumed" && (
        <>
          <CheckIcon className="size-3.5 shrink-0 text-emerald-500" />
          <span className="min-w-0 flex-1 text-[13px] dark:text-[#d4d4d4] light:text-[#404040]">
            Picked the stream back up.
          </span>
          {resumedTokens !== undefined && (
            <span
              className={cn(
                mono,
                "shrink-0 tabular-nums dark:text-[#525252] light:text-[#a3a3a3]",
              )}
            >
              +{resumedTokens} tokens
            </span>
          )}
        </>
      )}
    </div>
  );
}

// Header status dot: amber pulse while offline, hidden while online. Driven
// purely by the browser's online/offline events.
export function ConnectionDot({ className }: { className?: string }) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (online) return null;

  // QA m7: a 1.5px dot read as "no indicator at all" — render a labeled pill.
  return (
    <span
      role="status"
      aria-label="Offline"
      title="Offline — reconnecting when the network returns"
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5",
        "dark:bg-[#ffb400]/[0.08] light:bg-[#d49600]/[0.10]",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-[#ffb400] light:bg-[#d49600] animate-pulse motion-reduce:animate-none" />
      <span className={cn(mono, "text-[10px] uppercase tracking-[0.08em] dark:text-[#ffb400] light:text-[#a87700]")}>
        Offline
      </span>
    </span>
  );
}
