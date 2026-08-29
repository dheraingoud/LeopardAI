"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { inkButton, mono, paper } from "./surfaces";
import { pct } from "./range";

export function QuotaBanner({
  used,
  limit,
  unit,
  resetsIn,
  upgradeLabel,
  onUpgrade,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "used"
  | "limit"
  | "unit"
  | "resetsIn"
  | "upgradeLabel"
  | "onUpgrade"
> & {
  used: number;
  limit: number;
  unit: string;
  resetsIn: string;
  upgradeLabel: string;
  onUpgrade?: () => void;
}) {
  const left = Math.max(0, limit - used);
  const ratio = limit === 0 ? 0 : used / limit;
  const tight = ratio >= 0.9;

  return (
    <div
      data-slot="quota-banner"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-2.5 rounded-2xl p-3.5",
        className,
      )}
      {...props}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-[13.5px] font-medium dark:text-[#e5e5e5] light:text-[#262626]",
            tight && "dark:text-[#ffb400] light:text-[#d49600]",
          )}
        >
          {left} {unit} left
        </span>
        <span
          className={cn(
            mono,
            "ms-auto tabular-nums dark:text-[#525252] light:text-[#a3a3a3]",
          )}
        >
          resets in {resetsIn}
        </span>
      </div>

      <span className="h-1 w-full overflow-hidden rounded-full dark:bg-white/[0.06] light:bg-black/[0.06]">
        <span
          className={cn(
            "block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
            tight
              ? "bg-[#ffb400] light:bg-[#d49600]"
              : "dark:bg-white/40 light:bg-black/40",
          )}
          style={{ width: `${pct(used, limit)}%` }}
        />
      </span>

      <div className="flex items-center gap-2">
        <span
          className={cn(
            mono,
            "tabular-nums dark:text-[#525252] light:text-[#a3a3a3]",
          )}
        >
          {used} of {limit} used
        </span>
        <button
          type="button"
          onClick={onUpgrade}
          className={cn(
            inkButton,
            "ms-auto flex h-7 items-center rounded-full px-3 text-xs font-medium",
          )}
        >
          {upgradeLabel}
        </button>
      </div>
    </div>
  );
}

// Header slot: no quota data source exists yet — renders null until one lands
// and passes real props to QuotaBanner.
export function HeaderQuotaBanner() {
  return null;
}
