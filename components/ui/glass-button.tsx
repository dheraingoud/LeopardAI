"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/**
 * GlassButton → SOLID BUTTON (2026-08-26, glass retirement per DESIGN.md).
 * Same props/geometry as before (size, variant, tint hints are accepted and
 * ignored) so callers don't change; renders the DESIGN.md circular/pill
 * chrome: hairline border, solid surface, press scale via CSS only.
 */
interface GlassButtonProps extends ComponentProps<"button"> {
  size?: number;
  tint?: number;
  tintColor?: string;
  variant?: "icon" | "capsule";
}

function GlassButton({
  size = 44,
  variant = "icon",
  className,
  style,
  children,
  type = "button",
  ...props
}: GlassButtonProps) {
  return (
    <button
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center outline-none transition-[transform,background-color] duration-150 active:scale-[0.92] focus-visible:outline-2 focus-visible:outline-[#ffb400] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40",
        "border dark:border-white/10 light:border-black/10 dark:bg-white/[0.05] light:bg-black/[0.04] dark:text-[#f5f5f7] light:text-[#1d1d1f] hover:dark:bg-white/[0.1] hover:light:bg-black/[0.08]",
        className
      )}
      style={{
        height: size,
        width: variant === "icon" ? size : undefined,
        borderRadius: variant === "icon" ? size / 2 : 9999,
        paddingInline: variant === "capsule" ? Math.round(size * 0.45) : 0,
        ...style,
      }}
      type={type}
      {...props}
    >
      <span className="relative inline-flex items-center justify-center gap-2 font-medium text-[15px] leading-none">
        {children}
      </span>
    </button>
  );
}

export { GlassButton };
export type { GlassButtonProps };
