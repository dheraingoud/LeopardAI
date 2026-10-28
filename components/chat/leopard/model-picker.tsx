"use client";

// Model picker: one pill in the composer, one popover with two views.
// Effort tiers come from the probed reasoning config (lib/nim.ts), never a name.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PopoverPanel,
  PopoverPanelContent,
  PopoverPanelTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
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
  speedLabel,
  type HealthStatus,
  type ModelHealth,
} from "@/hooks/use-model-health";

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

export function ModelPicker() {
  const {
    currentModelId,
    setCurrentModel,
    currentReasoning,
    setReasoning,
  } = useActiveChat();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"effort" | "models">("effort");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const sliderTrackRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
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

  const committedIndex = useMemo(() => {
    const idx = tierIndex(tiers, currentReasoning);
    if (idx >= 0) return idx;
    const fallback = defaultTier(tiers, selected.reasoningConfig);
    const fi = fallback ? tierIndex(tiers, fallback.id) : -1;
    return fi >= 0 ? fi : 0;
  }, [tiers, currentReasoning, selected.reasoningConfig]);

  const maxIndex = Math.max(0, tiers.levels.length - 1);
  const displayIndex = Math.min(previewIndex ?? committedIndex, maxIndex);
  const displayTier: EffortTier | undefined = tiers.levels[displayIndex];

  const hasEffort = tiers.kind !== "none";

  const onEffortPreview = useCallback((index: number) => {
    setPreviewIndex(index);
  }, []);

  const onEffortCommit = useCallback(
    (index: number) => {
      const tier = tiers.levels[index];
      setPreviewIndex(null);
      if (tier) setReasoning(tier.id);
    },
    [tiers, setReasoning],
  );

  const resetEffort = useCallback(() => {
    const fallback = defaultTier(tiers, selected.reasoningConfig);
    setPreviewIndex(null);
    if (fallback) setReasoning(fallback.id);
  }, [tiers, selected.reasoningConfig, setReasoning]);

  const selectModel = useCallback(
    (id: string) => {
      setCurrentModel(id);
      setOpen(false);
      setView("effort");
      setPreviewIndex(null);
    },
    [setCurrentModel],
  );

  useEffect(() => {
    if (!open) return;
    if (view === "models") {
      listRef.current?.focus();
      return;
    }
    sliderTrackRef.current?.focus();
  }, [open, view]);

  return (
    <div data-slot="model-picker" className="flex min-w-0 shrink-0">
      <PopoverPanel
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setView("effort");
            setPreviewIndex(null);
          }
        }}
      >
        <PopoverPanelTrigger
          data-slot="model-picker-trigger"
          aria-label={
            hasEffort
              ? `Model ${selected.name}, reasoning effort ${displayTier?.label ?? "none"}`
              : `Model ${selected.name}`
          }
          className={cn(
            "inline-flex h-[27px] max-w-[46vw] items-center justify-center gap-[3px] whitespace-nowrap",
            "rounded-[14px] border border-transparent bg-transparent px-[7px] text-[12px] leading-none",
            "tracking-[-0.14px] text-[var(--leopard-text)] outline-none",
            "transition-[background-color,border-color,color] duration-[180ms]",
            "hover:border-[var(--leopard-border-subtle)] hover:bg-[var(--leopard-surface-elevated)]",
            "focus-visible:border-[var(--leopard-border-subtle)] focus-visible:bg-[var(--leopard-surface-elevated)]",
          )}
        >
          <span className="min-w-0 truncate font-[450]">{selected.name}</span>
          {hasEffort ? (
            <span className="grid shrink-0 font-medium text-[var(--leopard-amber)]">
              {tiers.levels.map((tier, i) => (
                <span
                  key={tier.id}
                  className={cn(
                    "col-start-1 row-start-1 whitespace-nowrap",
                    i !== displayIndex && "invisible",
                  )}
                >
                  {tier.label}
                </span>
              ))}
            </span>
          ) : null}
          <ChevronDownIcon
            aria-hidden="true"
            strokeWidth={1.25}
            className="size-[9px] shrink-0 text-[var(--leopard-text-muted)]"
          />
        </PopoverPanelTrigger>

        <PopoverPanelContent
          data-slot="model-picker-popover"
          align="start"
          side="top"
          sideOffset={8}
          shellClassName="leopard-picker-panel overflow-hidden"
          bodyClassName="min-w-0 max-w-none p-0"
          initialFocus={() =>
            view === "models" ? listRef.current : sliderTrackRef.current
          }
        >
          {view === "models" ? (
            <ModelView
              models={models}
              selectedId={selected.id}
              health={health}
              onSelect={selectModel}
              listRef={listRef}
            />
          ) : (
            <EffortView
              tiers={tiers}
              index={displayIndex}
              model={selected}
              onPreview={onEffortPreview}
              onCommit={onEffortCommit}
              onReset={resetEffort}
              onOpenModels={() => setView("models")}
              sliderTrackRef={sliderTrackRef}
            />
          )}
        </PopoverPanelContent>
      </PopoverPanel>
    </div>
  );
}

function EffortView({
  tiers,
  index,
  model,
  onPreview,
  onCommit,
  onReset,
  onOpenModels,
  sliderTrackRef,
}: {
  tiers: EffortTiers;
  index: number;
  model: ChatModel;
  onPreview: (index: number) => void;
  onCommit: (index: number) => void;
  onReset: () => void;
  onOpenModels: () => void;
  sliderTrackRef: React.RefObject<HTMLDivElement | null>;
}) {
  const tier = tiers.levels[index];
  const noReasoning = tiers.kind === "none";

  return (
    <div
      data-slot="model-picker-effort"
      className="relative h-[97px] w-[255px] overflow-hidden"
    >
      <div
        data-slot="model-picker-effort-label"
        className={cn(
          "absolute inset-x-9 top-[11px] h-[18px] text-center text-[14px] leading-[18px]",
          "font-medium tracking-[-0.2px]",
          noReasoning
            ? "text-[var(--leopard-text-dim)]"
            : "text-[var(--leopard-amber)]",
        )}
      >
        {noReasoning ? "No reasoning" : (tier?.label ?? "Thinking")}
      </div>

      <button
        type="button"
        data-slot="model-picker-model-link"
        onClick={onOpenModels}
        aria-label="Select model"
        className={cn(
          "absolute top-[29px] left-1/2 flex h-[17px] max-w-[190px] -translate-x-1/2 items-center",
          "justify-center gap-[3px] whitespace-nowrap rounded-[4px] px-1 text-[11.5px] leading-4",
          "text-[var(--leopard-text-muted)] outline-none transition-colors",
          "hover:text-[var(--leopard-text)] focus-visible:outline-1 focus-visible:outline-offset-1",
          "focus-visible:outline-[var(--leopard-amber)]",
        )}
      >
        <span className="truncate">{model.name}</span>
        <ChevronDownIcon
          aria-hidden="true"
          strokeWidth={1.2}
          className="size-2 shrink-0 text-[var(--leopard-text-muted)]"
        />
      </button>

      {!noReasoning ? (
        <button
          type="button"
          data-slot="model-picker-reset"
          onClick={onReset}
          aria-label="Reset effort"
          title="Reset effort"
          className={cn(
            "absolute top-[10px] right-[11px] grid size-4 place-items-center rounded-full border-0 p-0",
            "bg-transparent text-[var(--leopard-text-muted)] outline-none",
            "transition-[color,transform] duration-[160ms]",
            "hover:rotate-[-28deg] hover:text-[var(--leopard-amber)]",
            "focus-visible:outline-1 focus-visible:outline-offset-1",
            "focus-visible:outline-[var(--leopard-amber)]",
          )}
        >
          <RotateCcwIcon aria-hidden="true" strokeWidth={1.35} className="size-[15px]" />
        </button>
      ) : null}

      {noReasoning ? (
        <p className="absolute inset-x-6 top-[62px] text-center text-[11px] leading-snug text-[var(--leopard-text-dim)]">
          This model has no adjustable reasoning effort.
        </p>
      ) : (
        <div className="absolute inset-x-[11px] top-[60px] h-[28px]">
          <Slider
            ariaLabel="Reasoning effort"
            ariaValueText={tier?.label}
            value={index}
            max={Math.max(0, tiers.levels.length - 1)}
            onValueChange={onPreview}
            onCommit={onCommit}
            trackRef={sliderTrackRef}
          />
        </div>
      )}
    </div>
  );
}

function ModelView({
  models,
  selectedId,
  health,
  onSelect,
  listRef,
}: {
  models: ChatModel[];
  selectedId: string;
  health: Record<string, ModelHealth | undefined>;
  onSelect: (id: string) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
}) {
  const defaultModel = getDefaultChatModel();
  const [activeIndex, setActiveIndex] = useState(0);

  const rows = useMemo(
    () =>
      models.map((m) => {
        const h = health[m.id];
        return {
          id: m.id,
          name: m.name,
          status: h?.status,
          badge: healthLabel(h) ?? speedLabel(h),
          disabled: m.unavailable || h?.status === "down",
        };
      }),
    [models, health],
  );

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
    [activeIndex, enabledIndexes, listRef],
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
    <div data-slot="model-picker-models" className="w-[255px] pt-[10px]">
      <div className="ml-[12px] text-[12px] leading-4 text-[var(--leopard-text-muted)]">
        Select model
      </div>

      <button
        type="button"
        data-slot="model-picker-default"
        onClick={() => onSelect(defaultModel.id)}
        className={cn(
          "mt-[8px] ml-[12px] flex h-[37px] w-[calc(100%-24px)] flex-col items-start justify-center",
          "rounded-[5px] border-0 bg-transparent p-0 text-left outline-none transition-colors",
          "hover:bg-[rgba(255,255,255,0.05)] focus-visible:outline-1 focus-visible:outline-offset-1",
          "focus-visible:outline-[var(--leopard-amber)]",
        )}
      >
        <span className="text-[12px] leading-4 text-[var(--leopard-text)]">
          Default
        </span>
        <span className="text-[11.5px] leading-[15px] text-[var(--leopard-text-muted)]">
          Recommended set of models
        </span>
      </button>

      {fleetDown ? (
        <div
          data-slot="model-picker-fleet-down"
          className="mx-[12px] mt-[6px] rounded-[5px] border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[10.5px] leading-snug text-red-500 dark:text-red-400"
        >
          Every model is unreachable — the API key may be out of credits or
          expired.
        </div>
      ) : null}

      <div
        ref={listRef}
        role="listbox"
        aria-label="Select model"
        aria-activedescendant={
          rows[activeIndex] ? `model-picker-option-${activeIndex}` : undefined
        }
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={cn(
          "mt-[6px] ml-[7px] max-h-[337px] w-[calc(100%-14px)] overflow-y-auto",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "focus:outline-none",
        )}
      >
        {rows.map((row, i) => {
          const isSelected = row.id === selectedId;
          const isActive = i === activeIndex;
          return (
            <button
              key={row.id}
              id={`model-picker-option-${i}`}
              data-model-row={row.id}
              data-model-row-index={i}
              type="button"
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
                "flex h-[29px] w-full items-center justify-between rounded-[5px] border-0",
                "px-[5px] pr-[7px] text-left text-[12px] leading-4 tracking-[-0.12px]",
                "text-[var(--leopard-text)] outline-none transition-colors",
                row.disabled && "cursor-not-allowed opacity-45",
                !row.disabled &&
                  (isActive
                    ? "bg-[rgba(255,255,255,0.05)]"
                    : "hover:bg-[rgba(255,255,255,0.05)]"),
                "focus-visible:outline-1 focus-visible:outline-offset-1",
                "focus-visible:outline-[var(--leopard-amber)]",
              )}
            >
              <span className="flex min-w-0 items-center gap-[5px]">
                <span className="truncate">{row.name}</span>
                <HealthDot status={row.status} />
                {row.badge ? (
                  <span className="shrink-0 text-[10px] text-[var(--leopard-text-dim)]">
                    {row.badge}
                  </span>
                ) : null}
              </span>
              <CheckIcon
                aria-hidden="true"
                strokeWidth={1.45}
                className="size-[14px] shrink-0 text-[var(--leopard-text)]"
                style={{ opacity: isSelected ? 1 : 0 }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
