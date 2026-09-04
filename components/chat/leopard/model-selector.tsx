"use client";

import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getActiveModels } from "@/lib/ai/models";
import { useActiveChat } from "@/hooks/use-active-chat";
import type { ReasoningLevel } from "@/lib/nim";

export type EffortOption = { id: string; name: string };

export type ModelOption = {
  id: string;
  name: string;
  description?: string;
  disabled?: boolean;
  keywords?: readonly string[];
  efforts?: readonly EffortOption[];
};

// Kit ModelSelector, Leopard-wired: popover + search + list + footer effort
// radio row. Leopard registry supplies the models; useActiveChat supplies
// value/effort + setters.

type ModelSelectorContextValue = {
  models: readonly ModelOption[];
  value: string | undefined;
  setValue: (value: string) => void;
  selectedModel: ModelOption | undefined;
  efforts: readonly EffortOption[] | undefined;
  effort: string | undefined;
  setEffort: (effort: string) => void;
  setOpen: (open: boolean) => void;
  query: string;
  setQuery: (q: string) => void;
  activeId: string;
  setActiveId: (id: string) => void;
};

const ModelSelectorContext = createContext<ModelSelectorContextValue | null>(
  null,
);

function useModelSelector() {
  const ctx = useContext(ModelSelectorContext);
  if (!ctx) throw new Error("ModelSelector parts must sit inside <ModelSelector>");
  return ctx;
}

function ModelSelectorTrigger() {
  const { selectedModel, efforts, effort } = useModelSelector();
  const effortName = efforts?.find((e) => e.id === effort)?.name;
  return (
    <PopoverTrigger
      data-slot="model-selector-trigger"
      role="combobox"
      aria-haspopup="listbox"
      aria-label={`Model: ${selectedModel?.name ?? "Select model"}`}
      className="flex h-8 w-fit items-center justify-between gap-2 overflow-hidden rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap outline-none transition-colors hover:bg-foreground/[0.05] focus-visible:ring-1 focus-visible:ring-[#ffb400]/50"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">
          {selectedModel?.name ?? "Select model"}
        </span>
        {effortName && (
          <span className="text-foreground/40 min-w-7.5 truncate text-center">
            {effortName}
          </span>
        )}
      </span>
      <ChevronDownIcon className="size-3.5 opacity-50" />
    </PopoverTrigger>
  );
}

function ModelSelectorContent({
  searchable = true,
  className,
}: {
  searchable?: boolean;
  className?: string;
}) {
  const {
    models,
    value,
    setValue,
    setOpen,
    query,
    setQuery,
    activeId,
    setActiveId,
  } = useModelSelector();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...models];
    return models.filter((m) =>
      [m.name, m.id, ...(m.keywords ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [models, query]);

  const move = (delta: number) => {
    const enabled = matches.filter((m) => !m.disabled);
    if (enabled.length === 0) return;
    const at = enabled.findIndex((m) => m.id === activeId);
    const from = at === -1 ? (delta > 0 ? -1 : 0) : at;
    const next = enabled[(from + delta + enabled.length) % enabled.length];
    if (next) setActiveId(next.id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // The "popover" is Base UI's Menu — it typeahead-swallows every keystroke
    // before the input sees it. Stop propagation so typing reaches the field;
    // our own arrows/Enter handling below keeps list navigation working.
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const active = matches.find((m) => m.id === activeId && !m.disabled);
      if (active) {
        setValue(active.id);
        setOpen(false);
      }
    }
  };

  return (
    <PopoverContent
      data-slot="model-selector-content"
      align="start"
      side="top"
      sideOffset={6}
      className={cn("w-72 overflow-hidden rounded-xl p-0", className)}
    >
      {searchable && (
        <div className="border-b border-foreground/[0.07] px-3 py-2">
          <input
            data-slot="model-selector-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search models..."
            aria-label="Search models"
            className="text-foreground/85 placeholder:text-foreground/30 w-full bg-transparent text-[13px] outline-none"
          />
        </div>
      )}
      <div
        data-slot="model-selector-list"
        role="listbox"
        className="max-h-72 overflow-y-auto p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {matches.length === 0 && (
          <div className="text-foreground/30 px-3 py-4 text-center text-xs">
            No models found.
          </div>
        )}
        {matches.map((model) => (
          <ModelSelectorItem key={model.id} model={model} />
        ))}
      </div>
      <ModelSelectorEffort />
    </PopoverContent>
  );
}

function ModelSelectorItem({ model }: { model: ModelOption }) {
  const { value, setValue, setOpen, activeId, setActiveId } = useModelSelector();
  const isSelected = value === model.id;
  return (
    <button
      type="button"
      data-slot="model-selector-item"
      role="option"
      aria-selected={isSelected}
      disabled={model.disabled}
      onMouseEnter={() => setActiveId(model.id)}
      onClick={() => {
        setValue(model.id);
        setOpen(false);
      }}
      className={cn(
        "relative flex w-full items-start gap-2 rounded-lg py-2 ps-3 pe-9 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        model.id === activeId ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.03]",
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium">{model.name}</span>
        {model.description && (
          <span className="text-foreground/40 truncate text-xs">
            {model.description}
          </span>
        )}
      </span>
      {isSelected && (
        <span className="absolute end-3 top-2.5 flex size-4 items-center justify-center">
          <CheckIcon className="size-4 dark:text-[#ffb400] light:text-[#d49600]" />
        </span>
      )}
    </button>
  );
}

function ModelSelectorEffort({ label = "Thinking" }: { label?: ReactNode }) {
  const { efforts, effort, setEffort } = useModelSelector();
  if (!efforts?.length) return null;
  return (
    <div
      data-slot="model-selector-effort"
      className="flex cursor-default items-center justify-between gap-3 border-t border-foreground/[0.07] px-3 py-2"
    >
      <span className="text-foreground/40 text-xs">{label}</span>
      <RadioGroup
        value={effort ?? ""}
        onValueChange={(v) => setEffort(v as string)}
        aria-label={typeof label === "string" ? label : "Reasoning effort"}
        className="flex items-center gap-0.5"
      >
        {efforts.map((option) => (
          <Radio.Root
            key={option.id}
            value={option.id}
            className={cn(
              "text-foreground/45 hover:text-foreground/90 rounded-md px-2 py-1 text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[#ffb400]/50",
              "data-checked:bg-foreground/[0.07] data-checked:text-foreground data-checked:font-medium",
            )}
          >
            {option.name}
          </Radio.Root>
        ))}
      </RadioGroup>
    </div>
  );
}

function levelName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

// Leopard-wired root: registry models + useActiveChat state.
function ModelSelectorImpl() {
  const {
    currentModelId,
    setCurrentModel,
    currentReasoning,
    setReasoning,
  } = useActiveChat();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState("");

  const models = useMemo<ModelOption[]>(
    () =>
      getActiveModels().map((m) => {
        const cfg = m.reasoningConfig;
        const efforts =
          cfg?.enabled && cfg.toggleable && cfg.param
            ? (cfg.effortLevels?.length
                ? (["off", ...cfg.effortLevels] as string[])
                : ["off", "on"]
              ).map((id) => ({ id, name: levelName(id) }))
            : undefined;
        return {
          id: m.id,
          name: m.name,
          description: m.description.replace(`${m.name} — `, ""),
          disabled: m.unavailable,
          keywords: [m.id],
          efforts,
        };
      }),
    [],
  );

  const selectedModel = models.find((m) => m.id === currentModelId);
  const efforts = selectedModel?.efforts;
  const effort = efforts?.some((e) => e.id === currentReasoning)
    ? currentReasoning
    : undefined;

  const contextValue = useMemo<ModelSelectorContextValue>(
    () => ({
      models,
      value: currentModelId,
      setValue: setCurrentModel,
      selectedModel,
      efforts,
      effort,
      setEffort: (v) => setReasoning(v as ReasoningLevel),
      setOpen,
      query,
      setQuery,
      activeId,
      setActiveId,
    }),
    [
      models,
      currentModelId,
      setCurrentModel,
      selectedModel,
      efforts,
      effort,
      setReasoning,
      query,
      activeId,
    ],
  );

  return (
    <ModelSelectorContext.Provider value={contextValue}>
      <Popover open={open} onOpenChange={setOpen}>
        <ModelSelectorTrigger />
        <ModelSelectorContent />
      </Popover>
    </ModelSelectorContext.Provider>
  );
}

export const ModelSelector = memo(ModelSelectorImpl);
