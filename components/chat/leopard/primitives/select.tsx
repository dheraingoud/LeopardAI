"use client";

import type { ReactNode } from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const SelectRoot = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const selectTriggerVariants = cva(
  "group/select flex w-fit items-center justify-between gap-1.5 rounded-md text-[13px] tracking-tight whitespace-nowrap transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/40 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&>span]:min-w-0 [&>span]:truncate data-placeholder:text-foreground/40",
  {
    variants: {
      variant: {
        outline: "bg-black/[0.04] hover:bg-black/[0.06] dark:bg-white/[0.05] dark:hover:bg-white/[0.08] data-popup-open:bg-black/[0.06] dark:data-popup-open:bg-white/[0.08]",
        ghost: "text-foreground/50 hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06] data-popup-open:bg-black/[0.04] data-popup-open:text-foreground dark:data-popup-open:bg-white/[0.06]",
        muted: "bg-black/[0.06] text-foreground/80 hover:bg-black/[0.09] dark:bg-white/[0.09] dark:hover:bg-white/[0.12] data-popup-open:bg-black/[0.09] dark:data-popup-open:bg-white/[0.12]",
      },
      size: {
        default: "h-7 px-2 pe-1.5",
        sm: "h-6 px-1.5 pe-1 text-xs",
        lg: "h-8 px-2.5 pe-2",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

const SelectTrigger = ({
  className,
  variant,
  size,
  children,
  ...props
}: SelectPrimitive.Trigger.Props & VariantProps<typeof selectTriggerVariants>) => (
  <SelectPrimitive.Trigger
    data-slot="select-trigger"
    data-variant={variant ?? "outline"}
    data-size={size ?? "default"}
    className={cn(selectTriggerVariants({ variant, size }), className)}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon
      render={<ChevronDownIcon className="size-3 text-foreground/40 transition-transform duration-150 ease-out group-data-popup-open/select:rotate-180" />}
    />
  </SelectPrimitive.Trigger>
);

const SelectScrollUpButton = ({ className, ...props }: SelectPrimitive.ScrollUpArrow.Props) => (
  <SelectPrimitive.ScrollUpArrow
    data-slot="select-scroll-up-button"
    className={cn("top-0 flex w-full cursor-default items-center justify-center py-1 text-foreground/40", className)}
    {...props}
  >
    <ChevronUpIcon className="size-3.5" />
  </SelectPrimitive.ScrollUpArrow>
);

const SelectScrollDownButton = ({ className, ...props }: SelectPrimitive.ScrollDownArrow.Props) => (
  <SelectPrimitive.ScrollDownArrow
    data-slot="select-scroll-down-button"
    className={cn("bottom-0 flex w-full cursor-default items-center justify-center py-1 text-foreground/40", className)}
    {...props}
  >
    <ChevronDownIcon className="size-3.5" />
  </SelectPrimitive.ScrollDownArrow>
);

const SelectContent = ({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger">) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Positioner
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      alignItemWithTrigger={alignItemWithTrigger}
      className="isolate z-50"
    >
      <SelectPrimitive.Popup
        data-slot="select-content"
        className={cn(
          "relative z-50 max-h-[min(24rem,var(--available-height))] min-w-[max(8rem,var(--anchor-width))] overflow-x-hidden overflow-y-auto rounded-xl border p-1.5 outline-none dark:border-white/10 light:border-black/10 dark:bg-[#141414] light:bg-white dark:text-[#e5e5e5] light:text-[#262626] dark:shadow-[0_16px_50px_rgba(0,0,0,0.6)] light:shadow-[0_12px_40px_rgba(0,0,0,0.12)]",
          "duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none",
          className,
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.List className="flex scroll-my-1 flex-col gap-0.5">{children}</SelectPrimitive.List>
        <SelectScrollDownButton />
      </SelectPrimitive.Popup>
    </SelectPrimitive.Positioner>
  </SelectPrimitive.Portal>
);

const SelectLabel = ({ className, ...props }: SelectPrimitive.GroupLabel.Props) => (
  <SelectPrimitive.GroupLabel
    data-slot="select-label"
    className={cn("px-2.5 pt-1.5 pb-1 font-mono text-[11px] tracking-wide text-foreground/40", className)}
    {...props}
  />
);

const SelectItem = ({ className, children, ...props }: SelectPrimitive.Item.Props) => (
  <SelectPrimitive.Item
    data-slot="select-item"
    className={cn(
      "relative flex h-8 w-full cursor-default items-center gap-2 rounded-md py-0 ps-2.5 pe-8 text-[13px] tracking-tight outline-none select-none",
      "data-highlighted:bg-black/[0.05] dark:data-highlighted:bg-white/[0.06] data-selected:font-medium",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemIndicator render={<span className="absolute end-2.5 flex size-3.5 items-center justify-center" />}>
      <CheckIcon className="size-3.5 dark:text-[#ffb400] light:text-[#d49600]" />
    </SelectPrimitive.ItemIndicator>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
);

const SelectSeparator = ({ className, ...props }: SelectPrimitive.Separator.Props) => (
  <SelectPrimitive.Separator
    data-slot="select-separator"
    className={cn("mx-1.5 my-1 h-px dark:bg-white/[0.08] light:bg-black/[0.08]", className)}
    {...props}
  />
);

export interface SelectOption {
  value: string;
  label: ReactNode;
  textValue?: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Pick<SelectPrimitive.Root.Props<string>, "disabled">,
    VariantProps<typeof selectTriggerVariants> {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  className?: string;
}

function Select({ options, placeholder, className, value, onValueChange, variant, size, ...props }: SelectProps) {
  const selectedOption = options.find((opt) => opt.value === value);
  return (
    <SelectRoot
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue !== null) onValueChange(nextValue);
      }}
      {...props}
    >
      <SelectTrigger variant={variant} size={size} className={className}>
        <span className={cn(!selectedOption && placeholder && "text-foreground/40")}>
          {selectedOption?.label ?? placeholder}
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map(({ label, disabled, textValue, ...itemProps }) => (
          <SelectItem
            key={itemProps.value}
            {...itemProps}
            {...(disabled !== undefined ? { disabled } : {})}
            label={textValue ?? (typeof label === "string" ? label : itemProps.value)}
          >
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}

export {
  Select,
  SelectRoot,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
  selectTriggerVariants,
};
