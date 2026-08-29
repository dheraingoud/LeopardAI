"use client";

import { useRef, useState } from "react";
import { Brain, CheckIcon, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getActiveModels,
  getDefaultChatModel,
  getModelById,
  modelsByProvider,
  type ChatModel,
  type Provider,
} from "@/lib/ai/models";
import { useActiveChat } from "@/hooks/use-active-chat";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ReasoningLevel } from "@/lib/nim";
import { field, mono } from "./surfaces";
import { ReasoningEffort, levelLabel } from "./reasoning-effort";

// Forked grouped model list, wired to the leopard registry: provider sections
// from modelsByProvider, an env-gated Generation group for image models, and
// an effort sub-row whose hover submenu hosts ReasoningEffort. Unavailable
// models are disabled rows with a "down" flag.

const PROVIDER_LABEL: Record<Provider, string> = {
  nim: "NIM",
  gateway: "AI Gateway",
};

function capabilitiesOf(m: ChatModel): string[] {
  const caps: string[] = [];
  if (m.supportsReasoning) caps.push("reasoning");
  if (m.supportsVision) caps.push("vision");
  if (m.supportsTools) caps.push("tools");
  return caps;
}

function ModelRow({ model, onPick }: { model: ChatModel; onPick: (id: string) => void }) {
  const { currentModelId } = useActiveChat();
  const selected = model.id === currentModelId;
  const unavailable = !!model.unavailable;
  return (
    <button
      key={model.id}
      type="button"
      disabled={unavailable}
      aria-pressed={selected}
      onClick={() => !unavailable && onPick(model.id)}
      title={
        unavailable
          ? `${model.name} — ${model.unavailableReason ?? "unavailable"}`
          : model.description
      }
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-2 py-2 text-start transition-colors",
        unavailable
          ? "cursor-not-allowed opacity-45"
          : selected
            ? "dark:bg-[#ffb400]/10 light:bg-[#ffb400]/15"
            : "hover:dark:bg-white/[0.04] hover:light:bg-black/[0.03]",
      )}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {selected && !unavailable && (
          <CheckIcon className="fade-in zoom-in-90 animate-in size-3.5 text-[#ffb400] duration-200" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className={cn(
            "truncate text-[13.5px]",
            selected && !unavailable
              ? "text-[#ffb400]"
              : "dark:text-[#d4d4d4] light:text-[#404040]",
            unavailable && "dark:text-[#555] light:text-[#b8b8b8]",
          )}
        >
          {model.name}
          {model.supportsReasoning && !unavailable && (
            <Brain className="ml-1.5 inline h-3 w-3 text-[#ffb400]/60" />
          )}
        </span>
        <span className="flex flex-wrap gap-1">
          {capabilitiesOf(model).map((cap) => (
            <span
              key={cap}
              className={cn(field, mono, "rounded px-1 py-px dark:text-[#737373] light:text-[#8a8a8a]")}
            >
              {cap}
            </span>
          ))}
          {unavailable && (
            <span className="rounded px-1 py-px text-[9px] font-mono uppercase tracking-wide dark:text-[#ffb400]/50 light:text-[#b8860b]/60">
              down
            </span>
          )}
        </span>
      </span>
      <span className={cn(mono, "shrink-0 tabular-nums dark:text-[#595959] light:text-[#a3a3a3]")}>
        {Math.round(model.contextWindow / 1024)}k
      </span>
    </button>
  );
}

export function ModelPicker() {
  const { currentModelId, setCurrentModel, currentReasoning } = useActiveChat();
  const [open, setOpen] = useState(false);

  // Effort submenu opens toward free space; near the right edge it flips left.
  const effortRef = useRef<HTMLDivElement | null>(null);
  const [effortRight, setEffortRight] = useState(true);
  const measureEffortDir = () => {
    const el = effortRef.current;
    if (!el) return;
    setEffortRight(el.getBoundingClientRect().right + 288 <= window.innerWidth);
  };

  const current =
    getActiveModels().find((m) => m.id === currentModelId) ?? getDefaultChatModel();
  const providerKeys = Object.keys(modelsByProvider) as Provider[];
  const genModels = getActiveModels().filter((m) => m.kind === "image");

  const rcfg = getModelById(currentModelId)?.reasoningConfig;
  const rEnabled = !!rcfg?.enabled && !!rcfg.toggleable && !!rcfg.param;
  const rActive = currentReasoning !== undefined && currentReasoning !== "off";

  const pick = (id: string) => {
    setCurrentModel(id);
    setOpen(false);
  };

  return (
    <div className="relative shrink-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex h-9 max-w-[200px] items-center gap-1.5 rounded-xl px-2.5 font-mono text-[12px] transition-colors dark:text-[#a3a3a3] light:text-[#525252] dark:hover:bg-white/[0.05] light:hover:bg-black/[0.04] dark:hover:text-white light:hover:text-black"
              title={current.description}
            >
              <span className="truncate">{current.name}</span>
              {current.supportsReasoning && (
                <span className={cn("relative inline-flex shrink-0", rEnabled && rActive && "brain-shimmer")}>
                  <Brain
                    className={cn(
                      "h-3 w-3",
                      rEnabled
                        ? rActive
                          ? "text-[#ffb400]"
                          : "dark:text-[#6b6b6b] light:text-[#a9a9a9]"
                        : "text-[#ffb400]/60",
                    )}
                  />
                </span>
              )}
              {rEnabled && (
                <span
                  className={cn(
                    "shrink-0 font-mono text-[12px] leading-none",
                    rActive ? "text-[#ffb400]" : "dark:text-[#8a8a8a] light:text-[#5a5a5a]",
                  )}
                >
                  {rActive ? levelLabel(currentReasoning as ReasoningLevel) : "Off"}
                </span>
              )}
              <ChevronDown
                className={cn("h-3 w-3 shrink-0 opacity-60 transition-transform duration-200", open && "rotate-180")}
              />
            </button>
          }
        />
        <PopoverContent side="top" align="start" sideOffset={8} tint={0.6}>
          <div data-slot="model-picker" className="flex w-[280px] flex-col">
            <div className="max-h-[55vh] overflow-y-auto py-1">
              {providerKeys.map((p) => {
                const chatModels = modelsByProvider[p].filter((m) => m.kind === "text");
                if (chatModels.length === 0) return null;
                return (
                  <div key={p} className="p-1.5">
                    <div className={cn(mono, "px-2 pb-1 pt-2 uppercase dark:text-[#505050] light:text-[#a3a3a3]")}>
                      {PROVIDER_LABEL[p]}
                    </div>
                    {chatModels.map((m) => (
                      <ModelRow key={m.id} model={m} onPick={pick} />
                    ))}
                  </div>
                );
              })}
              {genModels.length > 0 && (
                <div className="border-t p-1.5 dark:border-white/[0.06] light:border-black/[0.06]">
                  <div className={cn(mono, "px-2 pb-1 pt-2 uppercase dark:text-[#ffb400]/70 light:text-[#d49600]/80")}>
                    Generation
                  </div>
                  {genModels.map((m) => (
                    <ModelRow key={m.id} model={m} onPick={pick} />
                  ))}
                </div>
              )}
            </div>
            {rEnabled && (
              <div className="shrink-0 border-t p-1.5 dark:border-white/[0.06] light:border-black/[0.06]">
                <div ref={effortRef} onMouseEnter={measureEffortDir} className="group relative">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-mono text-[12px] transition-colors dark:text-[#a3a3a3] light:text-[#525252] group-hover:dark:bg-white/[0.04] group-hover:light:bg-black/[0.03]"
                  >
                    <span className={cn(mono, "uppercase dark:text-[#505050] light:text-[#a3a3a3]")}>effort</span>
                    <span className="flex items-center gap-1 text-[#ffb400]">
                      {rActive ? levelLabel(currentReasoning as ReasoningLevel) : "Off"}
                      <ChevronRight
                        className={cn(
                          "h-3 w-3 opacity-70 transition-transform duration-300 group-hover:translate-x-0.5",
                          effortRight ? "" : "rotate-180 group-hover:-translate-x-0.5",
                        )}
                      />
                    </span>
                  </button>
                  <div
                    className={cn(
                      "pointer-events-none absolute top-0 z-20 opacity-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100",
                      effortRight ? "left-full ml-1.5 translate-x-1.5" : "right-full mr-1.5 -translate-x-1.5",
                    )}
                  >
                    <div className="rounded-2xl border bg-white/90 shadow-[0_16px_48px_-16px_rgba(0,0,0,0.55)] light:border-black/10 dark:border-white/10 dark:bg-[#181818]/95">
                      <ReasoningEffort />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
