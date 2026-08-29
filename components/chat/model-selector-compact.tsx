"use client";

import { useRef, useState } from "react";
import { ChevronDown, Check, Brain, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getActiveModels,
  modelsByProvider,
  getDefaultChatModel,
  getModelById,
  type Provider,
} from "@/lib/ai/models";
import { useActiveChat } from "@/hooks/use-active-chat";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TieredPicker, BinaryPicker, levelLabel } from "./reasoning-control";
import type { ReasoningLevel } from "@/lib/nim";

/**
 * ModelSelectorCompact — a Copilot-style popover anchored to the input bar.
 * Groups chat models by provider (NIM / AI Gateway), filters out generation-
 * only models from the text groups, and shows a reasoning icon for models that
 * support it. Φ8 adds a separate "Generation" group for image models
 * (kind:"image"); video models are deferred (need a source-video upload).
 *
 * The Generation group is env-gated: it lists whatever `kind:"image"` models
 * getActiveModels() returns, which in turn is NIM_IMAGE_MODELS-filtered. With
 * that env unset (Phase 8 ships dormant), the group is empty and renders
 * nothing — flip the env in Phase 9 (live-model binding) and the group appears.
 *
 * Liquid-glass: trigger stays a native mono pill (density + model-name
 * readability beat a glass capsule here); the list floats a Popover
 * (base-ui Menu owns open/close + Esc + click-out + portal — custom document
 * listeners gone). Menu stays clear frost — amber reserved for active-reasoning
 * / send / user-bubble / greeting (selective tint); only the active row + the
 * reasoning Brain icon carry amber inside.
 */
const PROVIDER_LABEL: Record<Provider, string> = {
  nim: "NIM",
  gateway: "AI Gateway",
};

export function ModelSelectorCompact() {
  const { currentModelId, setCurrentModel, currentReasoning, setReasoning } =
    useActiveChat();
  const [open, setOpen] = useState(false);

  // Effort submenu slides toward the page's free space: with the sidebar open or
  // the menu near the right edge, opening right would push it off-screen, so we
  // measure the footer's rect on hover and flip to open left instead.
  const effortRef = useRef<HTMLDivElement | null>(null);
  const [effortRight, setEffortRight] = useState(true);
  const measureEffortDir = () => {
    const el = effortRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = 280; // submenu ~width
    setEffortRight(r.right + w + 8 <= window.innerWidth);
  };

  const current =
    getActiveModels().find((m) => m.id === currentModelId) ?? getDefaultChatModel();
  const providerKeys = Object.keys(modelsByProvider) as Provider[];

  // Shared reasoning-effort state (composer pill + effort footer). rEnabled =
  // the model exposes a toggleable param; locked-on reasoners (no param) still
  // show a plain Brain but no toggleable effort.
  const rcfg = getModelById(currentModelId)?.reasoningConfig;
  const rEnabled = !!rcfg?.enabled && !!rcfg.toggleable && !!rcfg.param;
  const rActive = currentReasoning !== undefined && currentReasoning !== "off";
  const rLabel = rActive
    ? levelLabel(currentReasoning as ReasoningLevel)
    : "Off";
  const rTiered = (rcfg?.effortLevels?.length ?? 0) > 0;

  return (
    <div className="relative shrink-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl text-[12px] font-mono dark:text-[#a3a3a3] light:text-[#525252] dark:hover:bg-white/[0.05] light:hover:bg-black/[0.04] dark:hover:text-white light:hover:text-black transition-colors max-w-[200px]"
              title={current.description}
            >
              <span className="truncate">{current.name}</span>
              {current.supportsReasoning && (
                <span
                  className={cn(
                    "relative inline-flex shrink-0",
                    rEnabled && rActive && "brain-shimmer"
                  )}
                >
                  <Brain
                    className={cn(
                      "h-3 w-3",
                      rEnabled
                        ? rActive
                          ? "text-[#ffb400]"
                          : "dark:text-[#6b6b6b] light:text-[#a9a9a9]"
                        : "text-[#ffb400]/60"
                    )}
                  />
                </span>
              )}
              {rEnabled && (
                <span
                  className={cn(
                    "shrink-0 text-[12px] font-mono leading-none",
                    rActive
                      ? "text-[#ffb400]"
                      : "dark:text-[#8a8a8a] light:text-[#5a5a5a]"
                  )}
                >
                  {rLabel}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "h-3 w-3 shrink-0 opacity-60 transition-transform duration-200",
                  open && "rotate-180"
                )}
              />
            </button>
          }
        />
        <PopoverContent side="top" align="start" sideOffset={8} tint={0.6}>
          <div className="w-[280px] flex flex-col">
            <div className="max-h-[55vh] overflow-y-auto py-1">
            {providerKeys.map((p) => {
              const chatModels = modelsByProvider[p].filter((m) => m.kind === "text");
              if (chatModels.length === 0) return null;
              return (
                <div key={p} className="p-1.5">
                  <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-tighter dark:text-[#505050] light:text-[#a3a3a3]">
                    {PROVIDER_LABEL[p]}
                  </div>
                  {chatModels.map((m) => {
                    const active = m.id === currentModelId;
                    const unavailable = !!m.unavailable;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={unavailable}
                        onClick={() => {
                          if (unavailable) return;
                          setCurrentModel(m.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-[12px] font-mono transition-colors text-left",
                          unavailable &&
                            "opacity-45 cursor-not-allowed dark:text-[#555] light:text-[#b8b8b8]",
                          !unavailable && (active
                            ? "dark:bg-[#ffb400]/10 light:bg-[#ffb400]/15 text-[#ffb400]"
                            : "dark:text-[#a3a3a3] light:text-[#525252] dark:hover:bg-white/[0.04] light:hover:bg-black/[0.03] dark:hover:text-white light:hover:text-black"),
                        )}
                        title={
                          unavailable
                            ? `${m.name} — ${m.unavailableReason ?? "unavailable"}`
                            : m.description
                        }
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{m.name}</span>
                          {m.supportsReasoning && !unavailable && (
                            <Brain className="h-3 w-3 text-[#ffb400]/60 shrink-0" />
                          )}
                          {unavailable && (
                            <span className="shrink-0 text-[9px] font-mono uppercase tracking-wide dark:text-[#ffb400]/50 light:text-[#b8860b]/60">
                              down
                            </span>
                          )}
                        </span>
                        {active && !unavailable && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {(() => {
              // Φ8: env-gated "Generation" group (image models only). Empty when
              // NIM_IMAGE_MODELS unset → renders nothing (dormant). Video deferred.
              const genModels = getActiveModels().filter((m) => m.kind === "image");
              if (genModels.length === 0) return null;
              return (
                <div className="p-1.5 border-t dark:border-white/[0.06] light:border-black/[0.06]">
                  <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-tighter dark:text-[#ffb400]/70 light:text-[#d49600]/80">
                    Generation
                  </div>
                  {genModels.map((m) => {
                    const active = m.id === currentModelId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setCurrentModel(m.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-[12px] font-mono transition-colors text-left",
                          active
                            ? "dark:bg-[#ffb400]/10 light:bg-[#ffb400]/15 text-[#ffb400]"
                            : "dark:text-[#a3a3a3] light:text-[#525252] dark:hover:bg-white/[0.04] light:hover:bg-black/[0.03] dark:hover:text-white light:hover:text-black",
                        )}
                        title={m.description}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{m.name}</span>
                        </span>
                        {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            </div>
            {(() => {
              // Reasoning effort — pinned to the menu (never scrolls with the
              // model list above). Hovering it opens a RIGHT-side glass submenu
              // that slides out with a lazy liquid ease; the slider/picker lives
              // there, not inline.
              if (!rEnabled) return null;
              return (
                <div className="shrink-0 border-t dark:border-white/[0.06] light:border-black/[0.06] p-1.5">
                  <div
                    ref={effortRef}
                    onMouseEnter={measureEffortDir}
                    className="group relative"
                  >
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12px] font-mono transition-colors dark:text-[#a3a3a3] light:text-[#525252] group-hover:dark:bg-white/[0.04] group-hover:light:bg-black/[0.03]"
                    >
                      <span className="uppercase tracking-tighter text-[10px] dark:text-[#505050] light:text-[#a3a3a3]">
                        effort
                      </span>
                      <span className="flex items-center gap-1 text-[#ffb400]">
                        {rActive ? rLabel : "Off"}
                        <ChevronRight
                          className={cn(
                            "h-3 w-3 opacity-70 transition-transform duration-300 group-hover:translate-x-0.5",
                            effortRight ? "" : "rotate-180 group-hover:-translate-x-0.5"
                          )}
                        />
                      </span>
                    </button>
                    {/* Hover submenu: crisp glass (no blur), liquid opacity +
                        translate slide. Anchors toward free space — right by
                        default, flips left when the sidebar leaves no room so it
                        never runs off-screen or sinks behind the page. */}
                    <div
                      className={cn(
                        "pointer-events-none absolute top-0 z-20 opacity-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:pointer-events-auto group-hover:opacity-100 group-hover:translate-x-0",
                        effortRight
                          ? "left-full ml-1.5 translate-x-1.5"
                          : "right-full mr-1.5 -translate-x-1.5"
                      )}
                    >
                      <div className="rounded-2xl border dark:border-white/10 light:border-black/10 bg-white/90 dark:bg-[#181818]/95 shadow-[0_16px_48px_-16px_rgba(0,0,0,0.55)]">
                        {rTiered ? (
                          <TieredPicker
                            stops={rcfg.effortLevels as ReasoningLevel[]}
                            current={
                              currentReasoning as ReasoningLevel | undefined
                            }
                            onChange={setReasoning}
                          />
                        ) : (
                          <BinaryPicker active={rActive} onChange={setReasoning} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
