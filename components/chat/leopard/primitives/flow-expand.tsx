"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostButton } from "../surfaces";

// Expandable wrapper for diagrams: hover-reveal expand button opens a
// fullscreen pan/zoom overlay (upstream used a Dialog dep; here it's a fixed
// overlay with Escape-to-close). Pan/zoom logic is verbatim upstream.

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

const controlClass = cn(ghostButton, "size-8 bg-foreground/[0.04]");

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export type FlowExpandProps = Omit<ComponentProps<"div">, "children"> & {
  children: ReactNode;
};

export function FlowExpand({ className, children, ...props }: FlowExpandProps) {
  const [open, setOpen] = useState(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const onOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      drag.current = null;
      setTransform({ x: 0, y: 0, scale: 1 });
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const zoomBy = useCallback((factor: number, cx?: number, cy?: number) => {
    setTransform((current) => {
      const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
      const ratio = scale / current.scale;
      if (cx === undefined || cy === undefined) {
        const viewport = viewportRef.current;
        cx = (viewport?.clientWidth ?? 0) / 2;
        cy = (viewport?.clientHeight ?? 0) / 2;
      }
      return { scale, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio };
    });
  }, []);

  const onWheel = useCallback(
    (event: WheelEvent) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      zoomBy(
        Math.exp(-event.deltaY * 0.0015),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    },
    [zoomBy],
  );

  const onPointerDown = useCallback((event: PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setTransform((current) => {
      drag.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: current.x,
        originY: current.y,
      };
      return current;
    });
  }, []);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const currentDrag = drag.current;
    if (!currentDrag) return;
    setTransform((current) => ({
      ...current,
      x: currentDrag.originX + event.clientX - currentDrag.startX,
      y: currentDrag.originY + event.clientY - currentDrag.startY,
    }));
  }, []);

  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  return (
    <div
      data-slot="flow-expand"
      className={cn("group/flow relative", className)}
      {...props}
    >
      {children}
      <button
        ref={triggerRef}
        type="button"
        aria-label="Expand diagram"
        title="Expand diagram"
        aria-expanded={open}
        onClick={() => onOpenChange(true)}
        className={cn(
          controlClass,
          "absolute end-2 top-2 opacity-0 group-hover/flow:opacity-100 focus-visible:opacity-100",
        )}
      >
        <Maximize2 className="size-3.5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Expanded diagram"
          className="fade-in animate-in fixed inset-0 z-50 bg-background duration-200"
        >
          <div
            ref={viewportRef}
            data-slot="flow-expand-viewport"
            className="h-full w-full cursor-grab touch-none overflow-hidden active:cursor-grabbing"
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div
              data-slot="flow-expand-content"
              className="flex h-full w-full items-center justify-center"
              style={{
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                transformOrigin: "0 0",
              }}
            >
              {children}
            </div>
          </div>
          <div className="absolute end-4 top-4 flex items-center gap-1">
            <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.25)} className={controlClass}>
              <Plus className="size-4" />
            </button>
            <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(0.8)} className={controlClass}>
              <Minus className="size-4" />
            </button>
            <button type="button" aria-label="Reset zoom" title="Reset zoom" onClick={() => setTransform({ x: 0, y: 0, scale: 1 })} className={controlClass}>
              <RotateCcw className="size-4" />
            </button>
            <button type="button" aria-label="Close diagram" title="Close diagram" onClick={() => onOpenChange(false)} className={controlClass}>
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
