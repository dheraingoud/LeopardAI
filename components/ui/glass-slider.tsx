"use client";

import { cn } from "@/lib/utils";
import { useCallback, useRef, useState } from "react";

/**
 * GlassSlider → SOLID SLIDER (2026-08-26, glass retirement per DESIGN.md).
 * Same props contract as before (controlled/uncontrolled, step, accent) but
 * renders the DESIGN.md chrome: flat track, ink/amber fill, solid circular
 * thumb with hairline ring. Pointer drag + hidden native range for
 * keyboard/a11y. No refraction, no spring deform — a clean tool control.
 */

const TRACK_W = 240;
const TRACK_H = 6;
const THUMB = 18;

interface GlassSliderProps {
  accent?: string;
  ariaLabel?: string;
  className?: string;
  defaultValue?: number;
  disabled?: boolean;
  max?: number;
  min?: number;
  onValueChange?: (value: number) => void;
  step?: number;
  value?: number;
}

function GlassSlider({
  value,
  defaultValue = 50,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  disabled = false,
  ariaLabel = "Value",
  className,
  accent,
}: GlassSliderProps) {
  const fill = accent ?? "#ffb400";
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;
  const currentRef = useRef(current);
  currentRef.current = current;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const span = Math.max(max - min, 1e-6);
  const ratio = Math.min(1, Math.max(0, (current - min) / span));

  const commit = useCallback(
    (next: number) => {
      const clamped = Math.min(max, Math.max(min, next));
      const snapped = step > 0 ? Math.round((clamped - min) / step) * step + min : clamped;
      if (snapped !== currentRef.current) {
        if (value === undefined) setInternal(snapped);
        onValueChange?.(snapped);
      }
    },
    [max, min, step, value, onValueChange],
  );

  const valueFromEvent = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return currentRef.current;
      const rect = track.getBoundingClientRect();
      return min + ((clientX - rect.left) / rect.width) * span;
    },
    [min, span],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      commit(valueFromEvent(e.clientX));
    },
    [disabled, commit, valueFromEvent],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      commit(valueFromEvent(e.clientX));
    },
    [commit, valueFromEvent],
  );
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  return (
    <div
      className={cn("relative inline-flex items-center touch-none select-none", className)}
      style={{ width: TRACK_W, height: THUMB + 8, flexShrink: 0 }}
    >
      <input
        aria-label={ariaLabel}
        className="sr-only"
        max={max}
        min={min}
        onChange={(e) => commit(Number(e.target.value))}
        step={step}
        type="range"
        value={current}
        disabled={disabled}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 cursor-pointer"
        style={{ top: (THUMB + 8 - TRACK_H) / 2, height: TRACK_H }}
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        ref={trackRef}
      >
        <div
          className="absolute inset-0 rounded-full dark:bg-[#2a2a2a] light:bg-[#e5e5e5]"
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${ratio * 100}%`, background: fill }}
        />
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border",
            "dark:bg-[#1a1a1a] light:bg-white dark:border-white/20 light:border-black/15",
            "shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform duration-100",
            dragging ? "scale-110" : "",
          )}
          style={{ left: `${ratio * 100}%`, width: THUMB, height: THUMB }}
        />
      </div>
    </div>
  );
}

export { GlassSlider };
export type { GlassSliderProps };
