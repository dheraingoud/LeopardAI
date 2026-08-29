"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

type IndicatorStyle = { left: string; width: string };

type TabsListContextValue = {
  registerTrigger: (value: string, element: HTMLElement | null) => void;
  setHoveredValue: (value: string | null) => void;
};

const TabsListContext = createContext<TabsListContextValue | null>(null);

function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("group/tabs flex flex-col gap-2", className)} {...props} />;
}

const tabsListVariants = cva("group/tabs-list relative inline-flex w-fit items-center justify-center text-foreground/50", {
  variants: {
    variant: {
      default: "gap-1 rounded-lg bg-black/[0.04] p-1 dark:bg-white/[0.05]",
      line: "gap-1 border-b bg-transparent pb-2 dark:border-white/[0.08] light:border-black/[0.08]",
      ghost: "gap-1.5 bg-transparent",
      pills: "gap-2 bg-transparent",
      outline: "gap-1 rounded-lg border p-1 dark:border-white/[0.08] light:border-black/[0.08]",
    },
    size: { sm: "h-8", default: "h-9", lg: "h-10" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

const tabsActiveIndicatorVariants = cva("pointer-events-none absolute transition-all duration-300 ease-out", {
  variants: {
    variant: {
      default: "inset-y-1 rounded-md bg-white shadow-sm dark:bg-white/[0.1]",
      line: "bottom-0 h-0.5 bg-[#ffb400] light:bg-[#d49600]",
      ghost: "inset-y-1 rounded-md bg-black/[0.06] dark:bg-white/[0.08]",
      pills: "inset-y-0 rounded-full bg-[#ffb400] light:bg-[#d49600]",
      outline: "inset-y-1 rounded-md border bg-white dark:border-white/[0.08] dark:bg-white/[0.06]",
    },
  },
  defaultVariants: { variant: "default" },
});

function TabsList({
  className,
  variant,
  size,
  children,
  ...props
}: ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  const resolvedVariant = variant ?? "default";
  const resolvedSize = size ?? "default";

  const triggerRefs = useRef<Map<string, HTMLElement>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);
  const [activeStyle, setActiveStyle] = useState<IndicatorStyle>({ left: "0px", width: "0px" });
  const [hoverStyle, setHoverStyle] = useState<IndicatorStyle>({ left: "0px", width: "0px" });

  const registerTrigger = useCallback((value: string, element: HTMLElement | null) => {
    if (element) triggerRefs.current.set(value, element);
    else triggerRefs.current.delete(value);
  }, []);

  useEffect(() => {
    if (hoveredValue) {
      const element = triggerRefs.current.get(hoveredValue);
      if (element) setHoverStyle({ left: `${element.offsetLeft}px`, width: `${element.offsetWidth}px` });
    }
  }, [hoveredValue]);

  useEffect(() => {
    const listElement = listRef.current;
    if (!listElement) return;
    const updateActiveFromDOM = () => {
      const activeElement = listElement.querySelector("[data-active]") as HTMLElement | null;
      if (activeElement) setActiveStyle({ left: `${activeElement.offsetLeft}px`, width: `${activeElement.offsetWidth}px` });
    };
    requestAnimationFrame(updateActiveFromDOM);
    const observer = new MutationObserver(updateActiveFromDOM);
    observer.observe(listElement, { attributes: true, attributeFilter: ["data-active"], subtree: true });
    return () => observer.disconnect();
  }, []);

  const contextValue = useMemo(() => ({ registerTrigger, setHoveredValue }), [registerTrigger]);

  return (
    <TabsListContext.Provider value={contextValue}>
      <TabsPrimitive.List
        ref={listRef}
        data-slot="tabs-list"
        data-variant={resolvedVariant}
        data-size={resolvedSize}
        className={cn(tabsListVariants({ variant: resolvedVariant, size: resolvedSize }), className)}
        {...props}
      >
        {resolvedVariant === "ghost" && hoveredValue !== null && hoverStyle.width !== "0px" && (
          <div
            data-slot="tabs-hover-indicator"
            className="pointer-events-none absolute inset-y-1 rounded-md bg-black/[0.06] transition-all duration-300 ease-out dark:bg-white/[0.08]"
            style={hoverStyle}
          />
        )}
        {activeStyle.width !== "0px" && (
          <div data-slot="tabs-active-indicator" className={tabsActiveIndicatorVariants({ variant: resolvedVariant })} style={activeStyle} />
        )}
        {children}
      </TabsPrimitive.List>
    </TabsListContext.Provider>
  );
}

function TabsTrigger({ className, value, render, nativeButton, ...props }: ComponentProps<typeof TabsPrimitive.Tab>) {
  const context = useContext(TabsListContext);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    context?.registerTrigger(value, ref.current);
    return () => context?.registerTrigger(value, null);
  }, [context, value]);

  const handleMouseEnter = useCallback(() => context?.setHoveredValue(value), [context, value]);
  const handleMouseLeave = useCallback(() => context?.setHoveredValue(null), [context]);

  return (
    <TabsPrimitive.Tab
      ref={ref}
      value={value}
      render={render}
      nativeButton={nativeButton ?? render == null}
      data-slot="tabs-trigger"
      data-value={value}
      className={cn(
        "relative z-10 inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 font-medium whitespace-nowrap text-foreground/60 transition-[color] duration-300 outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-[#ffb400]/40 disabled:pointer-events-none disabled:opacity-50 data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=default]/tabs-list:rounded-md",
        "group-data-[variant=line]/tabs-list:rounded-md group-data-[variant=line]/tabs-list:bg-transparent",
        "group-data-[variant=ghost]/tabs-list:rounded-md group-data-[variant=ghost]/tabs-list:bg-transparent",
        "group-data-[variant=pills]/tabs-list:rounded-full group-data-[variant=pills]/tabs-list:data-active:text-black",
        "group-data-[variant=outline]/tabs-list:rounded-md",
        "group-data-[size=sm]/tabs-list:h-[calc(100%-8px)] group-data-[size=sm]/tabs-list:px-2 group-data-[size=sm]/tabs-list:py-0.5 group-data-[size=sm]/tabs-list:text-xs",
        "group-data-[size=default]/tabs-list:h-[calc(100%-8px)] group-data-[size=default]/tabs-list:px-3 group-data-[size=default]/tabs-list:py-1 group-data-[size=default]/tabs-list:text-sm",
        "group-data-[size=lg]/tabs-list:h-[calc(100%-8px)] group-data-[size=lg]/tabs-list:px-4 group-data-[size=lg]/tabs-list:py-1.5 group-data-[size=lg]/tabs-list:text-sm",
        className,
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Panel>) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn("flex-1 outline-none", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants, tabsActiveIndicatorVariants };
