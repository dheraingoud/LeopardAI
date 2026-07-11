"use client";

import { useState } from "react";
import { ChevronDown, Check, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getActiveModels,
  modelsByProvider,
  getDefaultChatModel,
  type Provider,
} from "@/lib/ai/models";
import { useActiveChat } from "@/hooks/use-active-chat";
import {
  GlassPopover,
  GlassPopoverContent,
  GlassPopoverTrigger,
} from "@/components/ui/glass-popover";

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
 * readability beat a glass capsule here); the list floats a GlassPopover
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
  const { currentModelId, setCurrentModel } = useActiveChat();
  const [open, setOpen] = useState(false);

  const current =
    getActiveModels().find((m) => m.id === currentModelId) ?? getDefaultChatModel();
  const providerKeys = Object.keys(modelsByProvider) as Provider[];

  return (
    <div className="relative shrink-0">
      <GlassPopover open={open} onOpenChange={setOpen}>
        <GlassPopoverTrigger
          render={
            <button
              type="button"
              className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl text-[12px] font-mono dark:text-[#a3a3a3] light:text-[#525252] dark:hover:bg-white/[0.05] light:hover:bg-black/[0.04] dark:hover:text-white light:hover:text-black transition-colors max-w-[200px]"
              title={current.description}
            >
              <span className="truncate">{current.name}</span>
              {current.supportsReasoning && (
                <Brain className="h-3 w-3 text-[#ffb400]/60 shrink-0" />
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
        <GlassPopoverContent side="top" align="start" sideOffset={8} tint={0.6}>
          <div className="w-[280px] max-h-[60vh] overflow-y-auto py-1">
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
                          {m.supportsReasoning && (
                            <Brain className="h-3 w-3 text-[#ffb400]/60 shrink-0" />
                          )}
                        </span>
                        {active && <Check className="h-3.5 w-3.5 shrink-0" />}
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
        </GlassPopoverContent>
      </GlassPopover>
    </div>
  );
}
