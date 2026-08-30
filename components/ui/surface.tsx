"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps, RefObject } from "react";

/**
 * Surface → SOLID SURFACE (2026-08-26): the liquid-glass system was
 * retired app-wide (user directive — "remove glass entirely, adopt the aui
 * fork end to end"). The component name/props stay so existing call sites
 * (artifact panel, modals, badges) keep compiling; it now renders an opaque
 * field surface — no backdrop blur, no refraction SVG, no specular rim.
 */

/** Kept for import compatibility (artifact-panel) — always false now. */
function useReducedFx(): boolean {
  return true;
}

interface SurfaceHandle {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setTintLift(delta: number): void;
}

interface SurfaceProps extends ComponentProps<"div"> {
  blur?: number;
  chroma?: number;
  handleRef?: RefObject<SurfaceHandle | null>;
  radius?: number;
  saturation?: number;
  specular?: boolean;
  tint?: number;
  tintColor?: string;
  darkTintColor?: string;
}

function Surface({
  radius = 16,
  className,
  style,
  children,
  // Retired glass props — accepted for call-site compat, never reach the DOM
  // (spreading them onto the div fires React's non-boolean-attribute warning).
  blur: _blur,
  chroma: _chroma,
  handleRef: _handleRef,
  saturation: _saturation,
  specular: _specular,
  tint: _tint,
  tintColor: _tintColor,
  darkTintColor: _darkTintColor,
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(
        "relative border dark:border-white/[0.08] light:border-black/[0.08] dark:bg-[#141414] light:bg-white",
        className,
      )}
      style={{ borderRadius: radius, ...style }}
      {...props}
    >
      <div className="relative h-full w-full rounded-[inherit]">{children}</div>
    </div>
  );
}

export { Surface, useReducedFx };
export type { SurfaceHandle, SurfaceProps };
