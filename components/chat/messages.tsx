"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useActiveChat } from "@/hooks/use-active-chat";
import { PreviewMessage, ThinkingMessage } from "./message";
import { Glass, type GlassDynamics } from "@/components/ui/glass";
import { MouseGlow } from "@/components/ui/mouse-glow";
import type { ChatMessage } from "@/lib/types";

/**
 * Messages — the scrollable transcript. Phase 5 renders text + reasoning
 * parts only (image/file/tool parts land in Phase 6).
 *
 * Auto-scroll sticks to the bottom ONLY while the user is parked there. The
 * per-token stream updates would otherwise yank the viewport back down when
 * the user has scrolled up to read history, and `behavior: 'smooth'` would
 * pile up half-finished smooth-scroll animations on every token — so we use
 * an instant `scrollTop` jump gated by a stickToBottom flag.
 */
export function Messages() {
  const { messages, status } = useActiveChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  // Φ-regen-ghost: while a regenerate runs, the SDK has dropped the old
  // assistant row from state — show the snapshot (dimmed) in its place so the
  // reply never visually vanishes. Clears the moment the stream settles or the
  // id reappears (mirror restored it).
  const [ghost, setGhost] = useState<ChatMessage | null>(null);
  useEffect(() => {
    const onGhost = (e: Event) => {
      const d = (e as CustomEvent).detail as { id: string; message: ChatMessage };
      if (d?.message) setGhost(d.message);
    };
    window.addEventListener("leopard:regen-ghost", onGhost);
    return () => window.removeEventListener("leopard:regen-ghost", onGhost);
  }, []);
  useEffect(() => {
    if (status === "ready" || status === "error") setGhost(null);
  }, [status, messages]);
  const showGhost =
    ghost !== null && !messages.some((m) => m.id === ghost.id);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottomRef.current = atBottom;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    // Instant jump (not smooth) — per-token updates would otherwise never
    // let a smooth-scroll animation finish.
    el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  if (messages.length === 0) {
    return <Greeting />;
  }

  const isThinking = status === "submitted";

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6"
    >
      <div className="max-w-3xl mx-auto py-6">
        {messages.map((message, index) => (
          <PreviewMessage
            key={message.id}
            message={message}
            isLast={index === messages.length - 1}
            status={status}
          />
        ))}
        {showGhost && (
          <div className="opacity-50 pointer-events-none select-none">
            <PreviewMessage message={ghost} isLast={false} status="ready" />
          </div>
        )}
        {isThinking && <ThinkingMessage />}
        <div className="h-32" /> {/* spacer for the floating input bar */}
      </div>
    </div>
  );
}

/**
 * Greeting — the one heavy-refraction centerpiece. An ambient refracting
 * `Glass` lens floats behind the amber identity text ("How can I help?"),
 * breathing via a self-authored rAF loop that mutates `dynamicsRef.zoom`
 * (1 → 1.18 over ~5s). No pointer tracking — the lens breathes on its own.
 *
 * Architecture: the interactive `Glass` is NOT the text container. It is a
 * separate ambient layer behind the text whose child is a faint amber radial
 * gradient — that gradient is what the lens refracts, so the visible sign of
 * "drift" is a soft amber shimmer breathing in/out around the title rather
 * than the glyphs themselves warping. Amber `#ffb400` signature text renders
 * on top, crisp — it lives outside `Glass`, so the SVG feDisplacementMap never
 * touches it. This keeps "amber text in front of the lens; refraction as the
 * ambient backdrop" literally true.
 *
 * Low scaleX/scaleY/chroma/depth (subtle paper refraction, not loud); a faint
 * amber paper-identity tint on the frosted veil. WebGL fallback on Safari is
 * handled by `Glass` itself. Auto-unmounts: `Messages` swaps `<Greeting/>`
 * for the transcript the instant `messages.length > 0`, so the rAF lifetime
 * is typically sub-second. `prefersReducedMotion` freezes the drift.
 */
function Greeting() {
  // Static lens — the breath is now a pure CSS keyframe on the amber bloom
  // (GPU-composited, honors prefers-reduced-motion). Kills a perpetual 60fps
  // JS rAF that ran forever on an idle empty chat.
  const dynamicsRef = useRef<GlassDynamics | null>({ zoom: 1, depthMul: 1 });

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 relative isolate">
      {/* Φ9 mouse-following specular lambert — overlay ambient on the Glass
       * surface. Layered above the refracting backdrop, mixBlendMode: screen
       * keeps it non-destructive against the warm-paper tint. */}
      <MouseGlow tone="amber" size={260} intensity={0.55} className="z-[1]" />
      {/* Ambient refracting glass layer — sits behind the text, breathes. */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <Glass
          scaleX={0.1}
          scaleY={0.1}
          chroma={0.1}
          depth={6}
          domeDepth={2}
          splay={1}
          blur={0}
          glow={0.12}
          glowSpread={0.5}
          glowExponent={1.5}
          edgeHighlight={0.3}
          edgeWidth={3}
          edgeExponent={1.5}
          specularStrength={1}
          specularAngle={45}
          tint={0.05}
          tintBlur={12}
          tintColor="255,180,0"
          dynamicsRef={dynamicsRef}
          className="w-[min(440px,82vw)] h-[200px] rounded-[2.5rem]"
          lens={<div data-glass-lens className="absolute inset-0 rounded-[2.5rem]" />}
        >
          {/* The bitmap the lens refracts — a soft amber radial bloom. */}
          <div className="glass-breath absolute inset-0 rounded-[2.5rem] bg-[radial-gradient(closest-side,rgba(255,180,0,0.12),transparent_72%)]" />
        </Glass>
      </div>
      {/* Amber identity text — crisp, above the lens (never enters Glass). */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative text-center"
      >
        <h1 className="font-signature text-5xl sm:text-6xl text-[#ffb400] text-glow-amber mb-3">
          How can I help?
        </h1>
        <p className="text-sm dark:text-[#505050] light:text-[#737373] font-mono">
          Ask anything — Leopard streams answers from your selected model.
        </p>
      </motion.div>
    </div>
  );
}
