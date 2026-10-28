"use client";

// Discrete slider — the amber current rail. Fill and thumb ride framer-motion
// motion values, so a drag paints from the pointer without re-rendering.

import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const THUMB_INSET = 14;
const EASE = [0.22, 1, 0.36, 1] as const;

interface SliderProps {
  ariaLabel?: string;
  ariaValueText?: string;
  className?: string;
  max: number;
  onCommit?: (value: number) => void;
  onValueChange: (value: number) => void;
  trackRef?: React.RefObject<HTMLDivElement | null>;
  value: number;
}

function Slider({
  value,
  max,
  onValueChange,
  onCommit,
  ariaLabel = "Value",
  ariaValueText,
  className,
  trackRef: externalTrackRef,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbX = useMotionValue(0);
  const fillWidth = useMotionValue(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [justMax, setJustMax] = useState(false);
  const [settleTick, setSettleTick] = useState(0);
  const draggingRef = useRef(false);
  const indexRef = useRef(value);
  const didInit = useRef(false);
  const justMaxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReducedMotion();

  const usable = Math.max(1, trackWidth - THUMB_INSET * 2);
  const ratio = max <= 0 ? 1 : Math.min(1, Math.max(0, value / max));
  const target = THUMB_INSET + usable * ratio;
  const isMax = max > 1 && value === max;

  const ticks = useMemo(() => {
    if (trackWidth <= 0) return [];
    const span = Math.max(1, trackWidth - THUMB_INSET * 2);
    const count = max + 1;
    return Array.from({ length: count }, (_, i) =>
      Math.round(THUMB_INSET + span * (max <= 0 ? 1 : i / max)),
    );
  }, [max, trackWidth]);

  useEffect(() => {
    indexRef.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      if (justMaxTimer.current) clearTimeout(justMaxTimer.current);
    };
  }, []);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setTrackWidth(el.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (trackWidth <= 0 || draggingRef.current) return;
    if (!didInit.current) {
      didInit.current = true;
      thumbX.set(target);
      fillWidth.set(target);
      return;
    }
    const options = { duration: reduced ? 0 : 0.28, ease: EASE };
    const thumb = animate(thumbX, target, options);
    const fill = animate(fillWidth, target, options);
    return () => {
      thumb.stop();
      fill.stop();
    };
  }, [dragging, fillWidth, reduced, settleTick, target, thumbX, trackWidth]);

  const applyIndex = useCallback(
    (next: number) => {
      const clamped = Math.min(max, Math.max(0, next));
      const previous = indexRef.current;
      indexRef.current = clamped;
      if (clamped !== previous) onValueChange(clamped);
      if (max > 1 && clamped === max && previous !== max) {
        setJustMax(true);
        if (justMaxTimer.current) clearTimeout(justMaxTimer.current);
        justMaxTimer.current = setTimeout(() => setJustMax(false), 700);
      }
    },
    [max, onValueChange],
  );

  const paint = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return indexRef.current;
    const rect = track.getBoundingClientRect();
    const span = Math.max(1, rect.width - THUMB_INSET * 2);
    const raw = Math.min(1, Math.max(0, (clientX - rect.left - THUMB_INSET) / span));
    const x = THUMB_INSET + span * raw;
    thumbX.set(x);
    fillWidth.set(x);
    return Math.round(raw * max);
  }, [fillWidth, max, thumbX]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      draggingRef.current = true;
      setDragging(true);
      const index = paint(e.clientX);
      if (index !== indexRef.current) applyIndex(index);
    },
    [applyIndex, paint],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const index = paint(e.clientX);
      if (index !== indexRef.current) applyIndex(index);
    },
    [applyIndex, paint],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setSettleTick((tick) => tick + 1);
      onCommit?.(indexRef.current);
    },
    [onCommit],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let next: number | null = null;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(max, value + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, value - 1);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = max;
      if (next === null) return;
      e.preventDefault();
      e.stopPropagation();
      applyIndex(next);
      onCommit?.(Math.min(max, Math.max(0, next)));
    },
    [applyIndex, max, onCommit, value],
  );

  return (
    <div
      data-slot="leopard-slider"
      className={cn(
        "leopard-slider relative w-full touch-none select-none",
        dragging && "is-dragging",
        isMax && "is-max",
        justMax && "just-max",
        className,
      )}
    >
      <div
        ref={(el) => {
          trackRef.current = el;
          if (externalTrackRef) externalTrackRef.current = el;
        }}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={ariaValueText}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className="leopard-slider-track"
      >
        <motion.div className="leopard-slider-fill" style={{ width: fillWidth }} />
      </div>
      <div className="leopard-slider-ticks" aria-hidden="true">
        {ticks.map((left) => (
          <i key={left} className="leopard-slider-tick" style={{ left: `${left}px` }} />
        ))}
      </div>
      <motion.div
        aria-hidden="true"
        className="leopard-slider-thumb"
        style={{ x: thumbX }}
      />
    </div>
  );
}

export { Slider };
export type { SliderProps };
