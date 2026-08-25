"use client";

import type { ComponentProps } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Leopard fork of assistant-ui's elements/surfaces.tsx — the ONE theme seam for
// the whole copied kit. aui recipes mapped to leopard's amber/liquid-glass
// tokens; ShimmerLabel/SwapLabel logic is verbatim from upstream.

// Glass card — diagonal wash + hairline + inset top highlight + blur.
export const paper =
  "border dark:border-white/[0.08] light:border-black/[0.08] " +
  "dark:bg-[linear-gradient(160deg,rgba(255,255,255,0.045)_0%,rgba(255,255,255,0.02)_100%)] " +
  "light:bg-[linear-gradient(160deg,rgba(255,255,255,0.85)_0%,rgba(246,243,235,0.75)_100%)] " +
  "dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] light:shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] " +
  "backdrop-blur-md";

export const floating = paper;

export const field = "dark:bg-white/[0.04] light:bg-black/[0.035]";

export const fieldInteractive =
  "dark:bg-white/[0.04] light:bg-black/[0.035] transition-colors hover:dark:bg-white/[0.07] hover:light:bg-black/[0.055]";

export const pressable =
  "transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.96] motion-reduce:transition-none";

export const ghostButton =
  "flex items-center justify-center rounded-full dark:text-[#737373] light:text-[#8a8a8a] outline-none transition-[background-color,color,scale] duration-150 hover:dark:bg-white/[0.06] hover:light:bg-black/[0.05] hover:dark:text-white hover:light:text-black active:scale-[0.96] focus-visible:ring-1 focus-visible:ring-[#ffb400]/40 motion-reduce:transition-none";

// The ONE solid-amber action (Allow once / selected suggestion) — matches the
// send-button tint (255,180,0).
export const inkButton =
  "bg-[#ffb400] light:bg-[#d49600] text-black transition-[filter,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:brightness-110 active:scale-[0.96] motion-reduce:transition-none";

export const iconSwap =
  "[grid-area:1/1] transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";

export const iconSwapIn = "scale-100 opacity-100 blur-none";

export const iconSwapOut = "scale-[0.25] opacity-0 blur-[4px]";

export const labelSwap =
  "col-start-1 row-start-1 flex w-max items-center gap-1.5 leading-none transition-[opacity,filter] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none";

export const labelSwapIn = "opacity-100 blur-none";

export const labelSwapOut =
  "pointer-events-none select-none opacity-0 blur-[2px]";

export const collapsePanel =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-[ending-style]:h-0 data-[starting-style]:h-0 motion-reduce:transition-none";

// Live/active accent — upstream blue remapped to leopard amber.
export const live = "dark:text-[#ffb400] light:text-[#d49600]";

export const mono = "font-mono text-[11px] tracking-tight";

export function ShimmerLabel({
  active = true,
  className,
  ...props
}: ComponentProps<"span"> & { active?: boolean }) {
  return (
    <span
      className={cn(active && "shimmer motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export const codeScroll = "overflow-x-auto";

export const codeSurface = "w-max min-w-full";

export function SwapLabel({
  active,
  children,
  className,
}: {
  active: 0 | 1;
  children: [React.ReactNode, React.ReactNode];
  className?: string;
}) {
  const layers = [useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null)];
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const target = layers[active]?.current;
    if (!target) return undefined;
    const measure = () =>
      setWidth(Math.ceil(target.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [active]);

  return (
    <span
      style={width === null ? undefined : { width }}
      className={cn(
        "grid overflow-x-clip transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
        className,
      )}
    >
      {children.map((layer, index) => (
        <span
          key={index}
          ref={layers[index]}
          aria-hidden={active !== index}
          className={cn(
            labelSwap,
            active === index ? labelSwapIn : labelSwapOut,
          )}
        >
          {layer}
        </span>
      ))}
    </span>
  );
}
