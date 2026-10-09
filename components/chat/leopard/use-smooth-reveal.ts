"use client";

// Leopard's port of assistant-ui's useSmooth (packages/react/src/utils/smooth,
// 2026-10-10): typewriter-style reveal that drains a backlog of streamed
// characters at a bounded rate instead of popping whole token bursts in.
// leopard-specific simplifications: no aui store plumbing — plain
// (target, running) inputs; commit throttling stays in StreamingText's 48ms
// throttle (we only hand it a shorter prefix), so minCommitMs is dropped.
//
// Tuning (aui defaults): drainMs 250 — target time to drain the backlog;
// maxCharIntervalMs 5 — slowest reveal rate when the backlog is short.
// Reduced-motion reveals everything immediately (same precedence as aui).

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export interface SmoothRevealOptions {
  drainMs?: number;
  maxCharIntervalMs?: number;
}

const DEFAULT_DRAIN_MS = 250;
const DEFAULT_MAX_CHAR_INTERVAL_MS = 5;

function usePrefersReducedMotion(): boolean {
  // useSyncExternalStore, not setState-in-effect: the media query is an
  // external store (lint 2026-10-10) and this also reads the first value
  // during render — no flash of full animation on reduced-motion devices.
  const reduce = useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  return reduce;
}

/**
 * Reveals `target` as a growing prefix while `running`. Returns the revealed
 * text; once the reveal catches up (or `running` ends) it returns `target`
 * verbatim. A settled-before-start commit can never leave an empty bubble:
 * a non-running target short-circuits to full text.
 */
export function useSmoothReveal(
  target: string,
  running: boolean,
  options?: SmoothRevealOptions,
): string {
  const reduceMotion = usePrefersReducedMotion();
  const drainMs = options?.drainMs && options.drainMs > 0 ? options.drainMs : DEFAULT_DRAIN_MS;
  const maxCharIntervalMs =
    options?.maxCharIntervalMs && options.maxCharIntervalMs > 0
      ? options.maxCharIntervalMs
      : DEFAULT_MAX_CHAR_INTERVAL_MS;

  const [revealed, setRevealed] = useState(() =>
    running ? "" : target,
  );
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  // Ref mirror of `revealed` for the rAF loop — written in the effect/rAF
  // callback only (lint: refs are not touched during render).
  const revealedRef = useRef(revealed);

  // Text discontinuity (message swap, edit, branch): resync instead of
  // animating through unrelated content. Runs in the effect below, not during
  // render — a settled target resyncs immediately; a running target restarts
  // the reveal from "" via the same path.
  useEffect(() => {
    if (!running || reduceMotion) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Settling must flush a mid-reveal prefix to full text; sync point with
      // the (external) rAF clock.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (revealedRef.current !== target) setRevealed(target);
      return;
    }
    // Reset on a text discontinuity (message swap/edit); rendering the old
    // prefix through unrelated content would be worse than one extra render.
    if (!target.startsWith(revealedRef.current)) setRevealed(""); // discontinuity
    if (revealedRef.current === target) return; // caught up; nothing to animate

    const animate = () => {
      const now = performance.now();
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      const cur = revealedRef.current;
      const remaining = target.length - cur.length;
      if (remaining <= 0) {
        rafRef.current = null;
        return;
      }
      const baseTimePerChar = Math.min(
        maxCharIntervalMs,
        drainMs / remaining,
      );
      let charsToAdd = 0;
      let toConsume = delta;
      while (toConsume >= baseTimePerChar && charsToAdd < remaining) {
        charsToAdd++;
        toConsume -= baseTimePerChar;
      }
      if (charsToAdd === 0) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }
      const next =
        charsToAdd >= remaining
          ? target
          : target.slice(0, cur.length + charsToAdd);
      revealedRef.current = next;
      setRevealed(next);
      if (next !== target) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        rafRef.current = null;
      }
    };

    lastTimeRef.current = performance.now();
    revealedRef.current = revealedRef.current === target ? target : revealedRef.current;
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, running, reduceMotion, drainMs, maxCharIntervalMs]);

  return revealed;
}
