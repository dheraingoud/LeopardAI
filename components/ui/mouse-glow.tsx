"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Φ9 specular cursor highlight on a Glass surface.
 *
 * Sits absolutely-positioned inside a relative Glass surface. Subscribes to
 * mousemove (lerps to 0 over ~120 ms via rAF) and writes CSS vars that an
 * inset radial-gradient consumes. `pointer-events: none` keeps the layer
 * non-interactive.
 *
 * Pass via `style={{ ["--mg-size" as string]: "..." }}` if you want a custom
 * halo diameter (defaults 220px). Tone via `tone` (amber primary, sky
 * secondary).
 *
 * Usage:
 *   <div className="relative ...">    ← the GlassShell wrapper
 *     <MouseGlow tone="amber" />
 *     ...children
 *  </div>
 */
interface MouseGlowProps {
  tone?: "amber" | "sky" | "violet";
  size?: number; // px
  intensity?: number; // 0..1 alpha multiplier — keep ≤ 0.5 to avoid highlight blowout
  className?: string;
  children?: ReactNode;
}

export function MouseGlow({
  tone = "amber",
  size = 220,
  intensity = 0.4,
  className,
}: MouseGlowProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const curRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    // No hover / coarse pointer (touch, stylus, TV): the glow can never show
    // (visibility is gated on group-hover) — skip the listeners AND the rAF
    // so we don't spin a 60fps loop forever on devices that can't see it.
    const canHover =
      typeof window !== "undefined" &&
      window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
    if (!canHover) return;

    const onMove = (e: MouseEvent) => {
      const rect = host.getBoundingClientRect();
      targetRef.current.x = e.clientX - rect.left;
      targetRef.current.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      // fade target outside the host so the head disappears
      targetRef.current.x = -9999;
      targetRef.current.y = -9999;
    };
    host.addEventListener("mousemove", onMove);
    host.addEventListener("mouseleave", onLeave);

    const tick = () => {
      // lerp to target (120ms feel)
      const dx = (targetRef.current.x - curRef.current.x) * 0.18;
      const dy = (targetRef.current.y - curRef.current.y) * 0.18;
      curRef.current.x += dx;
      curRef.current.y += dy;
      const el = ref.current;
      if (el) {
        el.style.setProperty("--mg-x", `${curRef.current.x}px`);
        el.style.setProperty("--mg-y", `${curRef.current.y}px`);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      host.removeEventListener("mousemove", onMove);
      host.removeEventListener("mouseleave", onLeave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const toneColor =
    tone === "sky"
      ? "rgba(56, 189, 248, "
      : tone === "violet"
      ? "rgba(167, 139, 250, "
      : "rgba(255, 180, 0, ";

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0",
        "opacity-0 transition-opacity duration-200",
        "group-hover/mglass:opacity-100",
        className,
      )}
      style={{
        // CSS-only radial that follows --mg-x/y. Two halo layers add depth.
        background: `radial-gradient(${size}px at var(--mg-x,50%) var(--mg-y,50%), ${toneColor}${0.18 * intensity}), transparent 70%), radial-gradient(${size * 1.4}px at var(--mg-x,50%) var(--mg-y,50%), ${toneColor}${0.06 * intensity}), transparent 80%)`,
        mixBlendMode: "screen",
      }}
    />
  );
}
