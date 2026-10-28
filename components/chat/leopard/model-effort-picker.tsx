"use client";

// Model + reasoning-effort picker.
//
// One popover, two triggers: the effort label opens the effort panel, the
// model name opens the model list. Every label comes from the selected model
// and its PROBED reasoning config (lib/nim.ts MODEL_REGISTRY) — nothing is
// hardcoded to a model name, and tiers are never inferred from a name.
//
// Changing either setting never issues a generation request: the choice is
// stored per chat + model and read by the next turn.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  RotateCcwIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PopoverPanel,
  PopoverPanelContent,
  PopoverPanelTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getActiveModels,
  getDefaultChatModel,
  type ChatModel,
} from "@/lib/ai/models";
import {
  defaultTier,
  effortTiers,
  tierIndex,
  type EffortTier,
  type EffortTiers,
} from "@/lib/ai/effort-tiers";
import { useActiveChat } from "@/hooks/use-active-chat";
import {
  useModelHealth,
  healthLabel,
  type HealthStatus,
  type ModelHealth,
} from "@/hooks/use-model-health";
import type { ReasoningLevel } from "@/lib/nim";

const EFFORT_TRIGGER = "effort";
const MODEL_TRIGGER = "model";

function HealthDot({ status }: { status?: HealthStatus }) {
  if (!status) return null;
  if (status === "checking") {
    return (
      <span
        data-slot="model-health-dot"
        data-health={status}
        aria-label="Checking model"
        title="Checking availability…"
        className="size-1.5 shrink-0 animate-pulse rounded-full bg-foreground/30 motion-reduce:animate-none"
      />
    );
  }
  if (status === "down") {
    return (
      <span
        data-slot="model-health-dot"
        data-health={status}
        aria-label="Currently down"
        title="Currently down"
        className="size-1.5 shrink-0 rounded-full bg-red-500"
      />
    );
  }
  return (
    <span
      data-slot="model-health-dot"
      data-health={status}
      aria-label="Available"
      title="Available"
      className="size-1.5 shrink-0 rounded-full bg-emerald-500"
    />
  );
}

function modelSubtitle(model: ChatModel): string | undefined {
  const stripped = model.description.replace(`${model.name} — `, "");
  return stripped === model.name ? undefined : stripped;
}

export function ModelEffortPicker() {
  const {
    currentModelId,
    setCurrentModel,
    currentReasoning,
    setReasoning,
  } = useActiveChat();

  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<string>(EFFORT_TRIGGER);
  const focusTarget = useRef<HTMLElement | null>(null);
  const { byId: health, load: loadHealth } = useModelHealth();

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const models = useMemo(() => {
    const list = getActiveModels().map((m, i) => ({ m, i }));
    return list
      .sort((a, b) => {
        const aDown = health[a.m.id]?.status === "down";
        const bDown = health[b.m.id]?.status === "down";
        return Number(aDown) - Number(bDown) || a.i - b.i;
      })
      .map(({ m }) => m);
  }, [health]);

  const selected = useMemo(
    () => models.find((m) => m.id === currentModelId) ?? getDefaultChatModel(),
    [models, currentModelId],
  );

  const tiers = useMemo(
    () => effortTiers(selected.reasoningConfig),
    [selected.reasoningConfig],
  );

  const activeTier = useMemo<EffortTier | undefined>(() => {
    const idx = tierIndex(tiers, currentReasoning);
    if (idx >= 0) return tiers.levels[idx];
    return defaultTier(tiers, selected.reasoningConfig);
  }, [tiers, currentReasoning, selected.reasoningConfig]);

  const hasEffort = tiers.kind !== "none";

  const onEffortChange = useCallback(
    (level: ReasoningLevel) => {
      setReasoning(level);
    },
    [setReasoning],
  );

  const resetEffort = useCallback(() => {
    const fallback = defaultTier(tiers, selected.reasoningConfig);
    if (fallback) setReasoning(fallback.id);
  }, [tiers, selected.reasoningConfig, setReasoning]);

  const selectModel = useCallback(
    (id: string) => {
      setCurrentModel(id);
      setOpen(false);
    },
    [setCurrentModel],
  );

  const openWith = useCallback((id: string) => {
    setTrigger(id);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const target = focusTarget.current;
    if (target) target.focus();
  }, [open, trigger]);

  return (
    <div
      data-slot="model-effort-picker"
      className="flex min-w-0 shrink-0 flex-col items-start"
    >
      <PopoverPanel open={open} onOpenChange={setOpen} triggerId={trigger}>
        <PopoverPanelTrigger
          id={EFFORT_TRIGGER}
          data-slot="effort-trigger"
          disabled={!hasEffort}
          onClick={() => openWith(EFFORT_TRIGGER)}
          aria-label={
            hasEffort
              ? `Reasoning effort: ${activeTier?.label ?? "none"}`
              : "Reasoning effort unavailable for this model"
          }
          className={cn(
            "flex min-w-0 max-w-[46vw] items-center gap-1 rounded-md px-1.5 py-0.5 text-start outline-none transition-colors",
            "hover:bg-foreground/[0.05] focus-visible:ring-1 focus-visible:ring-[var(--leopard-amber)]/50",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          <span
            data-slot="effort-trigger-label"
            className={cn(
              "truncate text-[11px] font-semibold leading-tight",
              hasEffort ? "text-[var(--leopard-amber)]" : "text-foreground/35",
            )}
          >
            {hasEffort ? (activeTier?.label ?? "Thinking") : "No reasoning"}
          </span>
        </PopoverPanelTrigger>

        <PopoverPanelTrigger
          id={MODEL_TRIGGER}
          data-slot="model-trigger"
          onClick={() => openWith(MODEL_TRIGGER)}
          aria-label={`Model: ${selected.name}`}
          aria-haspopup="listbox"
          className="flex min-w-0 max-w-[46vw] items-center gap-1 rounded-md px-1.5 py-0.5 text-start outline-none transition-colors hover:bg-foreground/[0.05] focus-visible:ring-1 focus-visible:ring-[var(--leopard-amber)]/50"
        >
          <span className="truncate text-[11px] leading-tight text-foreground/75">
            {selected.name}
          </span>
          <HealthDot status={health[selected.id]?.status} />
          <ChevronRightIcon className="size-3 shrink-0 opacity-60" />
        </PopoverPanelTrigger>

        <PopoverPanelContent
          data-slot="model-effort-popover"
          align="start"
          side="top"
          sideOffset={8}
          bodyClassName="py-0"
          className={trigger === MODEL_TRIGGER ? "w-[252px]" : "w-[262px]"}
          initialFocus={() => focusTarget.current}
        >
          {trigger === MODEL_TRIGGER ? (
            <ModelPanel
              models={models}
              selectedId={selected.id}
              health={health}
              onSelect={selectModel}
              onBack={() => setTrigger(EFFORT_TRIGGER)}
              focusTarget={focusTarget}
            />
          ) : (
            <EffortPanel
              tiers={tiers}
              activeTier={activeTier}
              model={selected}
              health={health[selected.id]?.status}
              onEffortChange={onEffortChange}
              onReset={resetEffort}
              onOpenModel={() => setTrigger(MODEL_TRIGGER)}
              focusTarget={focusTarget}
            />
          )}
        </PopoverPanelContent>
      </PopoverPanel>
    </div>
  );
}

function EffortPanel({
  tiers,
  activeTier,
  model,
  health,
  onEffortChange,
  onReset,
  onOpenModel,
  focusTarget,
}: {
  tiers: EffortTiers;
  activeTier: EffortTier | undefined;
  model: ChatModel;
  health?: HealthStatus;
  onEffortChange: (level: ReasoningLevel) => void;
  onReset: () => void;
  onOpenModel: () => void;
  focusTarget: React.RefObject<HTMLElement | null>;
}) {
  const maxTier = tiers.levels[tiers.levels.length - 1];
  const isMax = !!activeTier && !!maxTier && activeTier.id === maxTier.id;
  const noReasoning = tiers.kind === "none";

  return (
    <div
      data-slot="effort-panel"
      className="flex flex-col px-3.5 pt-3 pb-3.5"
    >
      <div className="relative flex items-start justify-center px-9">
        {!noReasoning ? (
          <Tooltip>
            <TooltipTrigger
              type="button"
              aria-label="Reset reasoning effort"
              onClick={onReset}
              className="absolute end-0 top-0 flex size-6 items-center justify-center rounded-md text-foreground/45 outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-1 focus-visible:ring-[var(--leopard-amber)]/50"
            >
              <RotateCcwIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent side="top">Reset to default</TooltipContent>
          </Tooltip>
        ) : null}
        <span
          data-slot="effort-panel-label"
          className={cn(
            "text-center text-[15px] font-semibold leading-tight",
            noReasoning
              ? "text-foreground/40"
              : "text-[var(--leopard-amber)]",
            isMax && "shimmer",
          )}
        >
          {noReasoning ? "No reasoning" : (activeTier?.label ?? "Thinking")}
        </span>
      </div>

      <button
        type="button"
        data-slot="effort-panel-model"
        onClick={onOpenModel}
        className="mx-auto mt-0.5 flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-center text-[12px] text-foreground/50 outline-none transition-colors hover:bg-foreground/[0.05] hover:text-foreground/75 focus-visible:ring-1 focus-visible:ring-[var(--leopard-amber)]/50"
      >
        <span className="truncate">{model.name}</span>
        <HealthDot status={health} />
        <ChevronDownIcon className="size-3 shrink-0 opacity-70" />
      </button>

      {noReasoning ? (
        <p
          data-slot="effort-panel-empty"
          className="mt-3 text-center text-[11px] leading-snug text-foreground/40"
        >
          This model has no adjustable reasoning effort.
        </p>
      ) : (
        <div className="pt-4">
          {tiers.kind === "binary" ? (
            <BinaryEffort
              tiers={tiers}
              activeTier={activeTier}
              onEffortChange={onEffortChange}
            />
          ) : (
            <DiscreteEffort
              tiers={tiers}
              activeTier={activeTier}
              onEffortChange={onEffortChange}
              focusTarget={focusTarget}
            />
          )}
        </div>
      )}
    </div>
  );
}

function BinaryEffort({
  tiers,
  activeTier,
  onEffortChange,
}: {
  tiers: EffortTiers;
  activeTier: EffortTier | undefined;
  onEffortChange: (level: ReasoningLevel) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Reasoning effort" className="flex gap-1.5">
      {tiers.levels.map((tier) => {
        const selected = tier.id === activeTier?.id;
        return (
          <button
            key={tier.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onEffortChange(tier.id)}
            className={cn(
              "flex-1 rounded-lg border px-3 py-1.5 text-[13px] font-medium outline-none transition-colors",
              "focus-visible:ring-1 focus-visible:ring-[var(--leopard-amber)]/60",
              selected
                ? "border-[var(--leopard-amber)]/60 bg-[var(--leopard-amber)]/12 text-[var(--leopard-amber)]"
                : "border-foreground/10 text-foreground/60 hover:bg-foreground/[0.05] hover:text-foreground",
            )}
          >
            {tier.label}
          </button>
        );
      })}
    </div>
  );
}

function DiscreteEffort({
  tiers,
  activeTier,
  onEffortChange,
  focusTarget,
}: {
  tiers: EffortTiers;
  activeTier: EffortTier | undefined;
  onEffortChange: (level: ReasoningLevel) => void;
  focusTarget: React.RefObject<HTMLElement | null>;
}) {
  const maxIndex = tiers.levels.length - 1;
  const idx = activeTier
    ? Math.max(0, tiers.levels.findIndex((t) => t.id === activeTier.id))
    : 0;
  const isMax = idx === maxIndex;

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const ratio = maxIndex <= 0 ? 0 : idx / maxIndex;

  const pick = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const t = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
      const next = Math.round(Math.min(1, Math.max(0, t)) * maxIndex);
      const tier = tiers.levels[next];
      if (tier) onEffortChange(tier.id);
    },
    [maxIndex, onEffortChange, tiers.levels],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    pick(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    pick(e.clientX);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = (delta: number) => {
      e.preventDefault();
      e.stopPropagation();
      const next = Math.min(maxIndex, Math.max(0, idx + delta));
      const tier = tiers.levels[next];
      if (tier) onEffortChange(tier.id);
    };
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "Home") step(-maxIndex);
    else if (e.key === "End") step(maxIndex);
  };

  return (
    <div data-slot="effort-slider">
      <div
        ref={(el) => {
          trackRef.current = el;
          focusTarget.current = el;
        }}
        role="slider"
        tabIndex={0}
        aria-label="Reasoning effort"
        aria-valuemin={0}
        aria-valuemax={maxIndex}
        aria-valuenow={idx}
        aria-valuetext={activeTier?.label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="relative h-6 cursor-pointer touch-none select-none outline-none focus-visible:ring-1 focus-visible:ring-[var(--leopard-amber)]/50"
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground/12" />
        <div
          className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-[var(--leopard-amber)]"
          style={{ width: `${ratio * 100}%` }}
        />
        {isMax ? (
          <div
            data-slot="effort-slider-halo"
            className="pointer-events-none absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--leopard-amber)]/30"
            style={{ left: `${ratio * 100}%` }}
          />
        ) : null}
        <div
          className={cn(
            "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/15 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] dark:border-white/25",
            isMax && "animate-pulse-amber motion-reduce:animate-none",
          )}
          style={{ left: `${ratio * 100}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between">
        {tiers.levels.map((tier, i) => (
          <button
            key={tier.id}
            type="button"
            onClick={() => onEffortChange(tier.id)}
            aria-label={`Reasoning effort ${tier.label}`}
            aria-pressed={i === idx}
            className="group/tick flex flex-col items-center gap-1 outline-none"
          >
            <span
              className={cn(
                "size-1 rounded-full transition-colors",
                i <= idx
                  ? "bg-[var(--leopard-amber)]"
                  : "bg-foreground/20 group-hover/tick:bg-foreground/40",
              )}
            />
            <span
              className={cn(
                "text-[10px] leading-none transition-colors",
                i === idx
                  ? "font-medium text-[var(--leopard-amber)]"
                  : "text-foreground/40",
              )}
            >
              {tier.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ModelPanel({
  models,
  selectedId,
  health,
  onSelect,
  onBack,
  focusTarget,
}: {
  models: ChatModel[];
  selectedId: string;
  health: Record<string, ModelHealth | undefined>;
  onSelect: (id: string) => void;
  onBack: () => void;
  focusTarget: React.RefObject<HTMLElement | null>;
}) {
  const defaultModel = getDefaultChatModel();
  const listRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(() => {
    const out: {
      id: string;
      name: string;
      subtitle?: string;
      health?: HealthStatus;
      badge?: string;
      disabled?: boolean;
    }[] = [
      {
        id: defaultModel.id,
        name: "Default",
        subtitle: "Recommended set of models",
      },
    ];
    for (const m of models) {
      if (m.id === defaultModel.id) continue;
      const h = health[m.id];
      out.push({
        id: m.id,
        name: m.name,
        subtitle: modelSubtitle(m),
        health: h?.status,
        badge: healthLabel(h),
        disabled: m.unavailable || h?.status === "down",
      });
    }
    return out;
  }, [defaultModel, models, health]);

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const at = rows.findIndex((r) => r.id === selectedId);
    setActiveIndex(at === -1 ? 0 : at);
  }, [rows, selectedId]);

  const enabledIndexes = useMemo(
    () =>
      rows
        .map((r, i) => (r.disabled ? -1 : i))
        .filter((i) => i !== -1),
    [rows],
  );

  const move = useCallback(
    (delta: number) => {
      if (enabledIndexes.length === 0) return;
      const at = enabledIndexes.indexOf(activeIndex);
      const from = at === -1 ? (delta > 0 ? -1 : 0) : at;
      const next =
        enabledIndexes[
          (from + delta + enabledIndexes.length) % enabledIndexes.length
        ];
      if (next === undefined) return;
      setActiveIndex(next);
      listRef.current
        ?.querySelector<HTMLElement>(`[data-model-row-index="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
    },
    [activeIndex, enabledIndexes],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      const first = enabledIndexes[0];
      if (first !== undefined) setActiveIndex(first);
    } else if (e.key === "End") {
      e.preventDefault();
      const last = enabledIndexes[enabledIndexes.length - 1];
      if (last !== undefined) setActiveIndex(last);
    } else if (e.key === "Enter" || e.key === " ") {
      const row = rows[activeIndex];
      if (row && !row.disabled) {
        e.preventDefault();
        onSelect(row.id);
      }
    }
  };

  const fleetDown =
    Object.keys(health).length > 0 &&
    models.every((m) => health[m.id]?.status === "down");

  return (
    <div data-slot="model-panel" className="flex flex-col">
      <div className="flex items-center justify-between px-3.5 pt-1 pb-2">
        <span className="text-[13px] font-semibold text-foreground/90">
          Select model
        </span>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-1.5 py-0.5 text-[11px] text-foreground/45 outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground/75 focus-visible:ring-1 focus-visible:ring-[var(--leopard-amber)]/50"
        >
          Effort
        </button>
      </div>
      <div
        ref={(el) => {
          listRef.current = el;
          focusTarget.current = el;
        }}
        role="listbox"
        aria-label="Select model"
        aria-activedescendant={
          rows[activeIndex] ? `model-option-${activeIndex}` : undefined
        }
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="max-h-[248px] overflow-y-auto px-1.5 pb-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus:outline-none"
      >
        {fleetDown ? (
          <div
            data-slot="model-panel-fleet-down"
            className="mx-1 mb-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] leading-snug text-red-500 dark:text-red-400"
          >
            Every model is unreachable — the API key may be out of credits or
            expired. Generation will fail until that&apos;s fixed.
          </div>
        ) : null}
        {rows.map((row, i) => {
          const isSelected = row.id === selectedId;
          const isActive = i === activeIndex;
          return (
            <div
              key={row.id}
              id={`model-option-${i}`}
              data-model-row={row.id}
              data-model-row-index={i}
              role="option"
              aria-selected={isSelected}
              aria-disabled={row.disabled || undefined}
              onMouseEnter={() => {
                if (!row.disabled) setActiveIndex(i);
              }}
              onClick={() => {
                if (row.disabled) return;
                onSelect(row.id);
              }}
              className={cn(
                "flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1.5 text-start transition-colors",
                row.disabled && "cursor-not-allowed opacity-45",
                isActive ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.04]",
              )}
            >
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-foreground/90">
                  {row.name}
                  <HealthDot status={row.health} />
                  {row.badge ? (
                    <span className="truncate text-[10px] text-red-500 dark:text-red-400">
                      {row.badge}
                    </span>
                  ) : null}
                </span>
                {row.subtitle ? (
                  <span className="truncate text-[11px] text-foreground/45">
                    {row.subtitle}
                  </span>
                ) : null}
              </span>
              {isSelected ? (
                <span className="ms-auto flex size-4 shrink-0 items-center justify-center">
                  <CheckIcon className="size-4 text-[var(--leopard-amber)]" />
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
