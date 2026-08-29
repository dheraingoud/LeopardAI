"use client";

import type { FC, ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon, SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Presentational shell for a trigger-driven picker (mentions / slash commands).
// The upstream version wires into its composer runtime; here categories/items are plain
// props and selection is via callbacks. Mount inside a `relative` composer anchor.

type IconComponent = FC<{ className?: string }>;

export type TriggerCategory = { id: string; label: ReactNode };
export type TriggerItem = { id: string; label: ReactNode; description?: string; icon?: string };

export type ComposerTriggerPopoverProps = {
  categories?: readonly TriggerCategory[];
  items?: readonly TriggerItem[];
  /** When set, the items list (with a back button) is shown instead of categories. */
  activeCategoryId?: string | null;
  isLoading?: boolean;
  onSelectCategory?: (id: string) => void;
  onSelectItem?: (item: TriggerItem) => void;
  onBack?: () => void;
  iconMap?: Record<string, IconComponent>;
  fallbackIcon?: IconComponent;
  backLabel?: string;
  emptyCategoriesLabel?: string;
  emptyItemsLabel?: string;
  loadingLabel?: string;
  className?: string;
};

function resolveIcon(key: string | undefined, map: Record<string, IconComponent> | undefined, fallback: IconComponent): IconComponent {
  if (key && map?.[key]) return map[key]!;
  return fallback;
}

export function ComposerTriggerPopover({
  categories = [],
  items = [],
  activeCategoryId = null,
  isLoading = false,
  onSelectCategory,
  onSelectItem,
  onBack,
  iconMap,
  fallbackIcon = SparklesIcon,
  backLabel = "Back",
  emptyCategoriesLabel = "No items available",
  emptyItemsLabel = "No matching items",
  loadingLabel = "Loading…",
  className,
}: ComposerTriggerPopoverProps) {
  const showingItems = activeCategoryId !== null;

  return (
    <div
      data-slot="composer-trigger-popover"
      className={cn(
        "absolute start-0 bottom-full z-50 mb-2 w-64 overflow-hidden rounded-xl border dark:border-white/10 light:border-black/10 dark:bg-[#141414] light:bg-white dark:text-[#e5e5e5] light:text-[#262626] dark:shadow-[0_16px_50px_rgba(0,0,0,0.6)] light:shadow-[0_12px_40px_rgba(0,0,0,0.12)]",
        className,
      )}
    >
      {!showingItems ? (
        <div data-slot="composer-trigger-popover-categories" className="flex flex-col py-1">
          {categories.map((cat) => {
            const Icon = resolveIcon(cat.id, iconMap, fallbackIcon);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory?.(cat.id)}
                className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm transition-colors outline-none hover:bg-black/[0.04] focus:bg-black/[0.04] dark:hover:bg-white/[0.06] dark:focus:bg-white/[0.06]"
              >
                <span className="flex items-center gap-2">
                  <Icon className="size-4 text-foreground/40" />
                  {cat.label}
                </span>
                <ChevronRightIcon className="size-4 text-foreground/40" />
              </button>
            );
          })}
          {categories.length === 0 && <div className="px-3 py-2 text-sm text-foreground/40">{emptyCategoriesLabel}</div>}
        </div>
      ) : (
        <div data-slot="composer-trigger-popover-items" className="flex flex-col">
          <button
            type="button"
            onClick={onBack}
            className="flex cursor-pointer items-center gap-1.5 border-b px-3 py-2 text-xs tracking-wide text-foreground/50 uppercase transition-colors hover:bg-black/[0.04] dark:border-white/[0.08] light:border-black/[0.08] dark:hover:bg-white/[0.06]"
          >
            <ChevronLeftIcon className="size-3.5" />
            {backLabel}
          </button>
          <div className="py-1">
            {items.map((item) => {
              const Icon = resolveIcon(item.icon, iconMap, fallbackIcon);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectItem?.(item)}
                  className="flex w-full cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-start transition-colors outline-none hover:bg-black/[0.04] focus:bg-black/[0.04] dark:hover:bg-white/[0.06] dark:focus:bg-white/[0.06]"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="size-3.5 dark:text-[#ffb400] light:text-[#d49600]" />
                    {item.label}
                  </span>
                  {item.description && <span className="ms-5.5 text-xs leading-tight text-foreground/50">{item.description}</span>}
                </button>
              );
            })}
            {items.length === 0 && (
              <div className="px-3 py-2 text-sm text-foreground/40">{isLoading ? loadingLabel : emptyItemsLabel}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
