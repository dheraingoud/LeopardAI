"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { paper } from "../surfaces";

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

function MermaidZoom({ svg, children }: { svg: string; children: ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );

  // Remap ids so the zoom copy doesn't collide with the inline original.
  const zoomSvg = useMemo(
    () =>
      svg
        .replace(/id="([^"]+)"/g, 'id="$1-zoom"')
        .replace(/url\(#([^)]+)\)/g, "url(#$1-zoom)")
        .replace(/(href|xlink:href)="#([^"]+)"/g, '$1="#$2-zoom"'),
    [svg],
  );

  useEffect(() => setIsMounted(true), []);

  const close = useCallback(() => {
    setIsOpen(false);
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [isOpen, close]);

  const zoomBy = useCallback((factor: number, cx?: number, cy?: number) => {
    setTransform((t) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor));
      const ratio = scale / t.scale;
      const vp = viewportRef.current;
      const px = cx ?? (vp?.clientWidth ?? 0) / 2;
      const py = cy ?? (vp?.clientHeight ?? 0) / 2;
      return { scale, x: px - (px - t.x) * ratio, y: py - (py - t.y) * ratio };
    });
  }, []);

  const btn =
    "rounded-sm p-1.5 dark:text-[#a3a3a3] light:text-[#525252] hover:dark:text-white hover:light:text-black";

  return (
    <div data-slot="mermaid-zoom-wrap" className="group/mermaid relative">
      {children}
      <button
        type="button"
        aria-label="Expand diagram"
        onClick={() => setIsOpen(true)}
        className={cn(
          paper,
          "absolute top-2 right-2 cursor-pointer rounded-md p-1.5 opacity-0 transition group-hover/mermaid:opacity-100 focus-visible:opacity-100",
        )}
      >
        <Maximize2 className="size-3.5" />
      </button>
      {isMounted &&
        isOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Diagram"
            className="fade-in animate-in fixed inset-0 z-50 duration-200 dark:bg-[#0a0a0a] light:bg-[#f6f3eb]"
          >
            <div
              ref={viewportRef}
              className="h-full w-full cursor-grab touch-none overflow-hidden active:cursor-grabbing"
              onWheel={(e) => {
                const r = viewportRef.current?.getBoundingClientRect();
                if (!r) return;
                zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, ox: transform.x, oy: transform.y };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                setTransform((t) => ({ ...t, x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
            >
              <div
                className="flex h-full w-full items-center justify-center [&_svg]:max-h-[80vh] [&_svg]:max-w-[90vw]"
                style={{
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                  transformOrigin: "0 0",
                }}
                dangerouslySetInnerHTML={{ __html: zoomSvg }}
              />
            </div>
            <div className={cn(paper, "absolute top-4 right-4 flex items-center gap-1 rounded-lg p-1")}>
              <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.25)} className={btn}>
                <Plus className="size-4" />
              </button>
              <button type="button" aria-label="Zoom out" onClick={() => zoomBy(0.8)} className={btn}>
                <Minus className="size-4" />
              </button>
              <button type="button" aria-label="Reset zoom" onClick={() => setTransform({ x: 0, y: 0, scale: 1 })} className={btn}>
                <RotateCcw className="size-4" />
              </button>
              <button type="button" aria-label="Close" onClick={close} className={btn}>
                <X className="size-4" />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// Static mermaid renderer (settled code only — streaming ownership stays with
// streaming-text's MermaidBlock). Uses the mermaid lib with leopard's amber
// theme; the upstream original used beautiful-mermaid, which isn't installed here.
export const MermaidDiagram = memo(function MermaidDiagram({
  code,
  streaming,
  className,
}: {
  code: string;
  streaming?: boolean;
  className?: string;
}) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (streaming) return;
    let active = true;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "loose",
          themeVariables: dark ? MERMAID_DARK : MERMAID_LIGHT,
          fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
        });
        const { svg: out } = await mermaid.render(`leo-mmd-${Math.random().toString(36).slice(2)}`, code);
        if (active) setSvg(out);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [code, dark, streaming]);

  if (streaming || (!svg && !failed)) {
    return (
      <div
        data-slot="mermaid-skeleton"
        aria-label="Rendering diagram"
        className={cn(
          "flex h-32 animate-pulse items-center justify-center gap-3 rounded-lg dark:bg-white/[0.04] light:bg-black/[0.035]",
          className,
        )}
      >
        <div className="h-8 w-20 rounded-md dark:bg-white/[0.08] light:bg-black/[0.07]" />
        <div className="h-px w-10 dark:bg-white/[0.08] light:bg-black/[0.07]" />
        <div className="h-8 w-20 rounded-md dark:bg-white/[0.08] light:bg-black/[0.07]" />
      </div>
    );
  }

  if (failed || !svg) {
    return (
      <div data-slot="mermaid-fallback" className={cn("rounded-lg dark:bg-white/[0.04] light:bg-black/[0.035]", className)}>
        <pre className="overflow-x-auto p-4 font-mono text-[13px]">{code.trim()}</pre>
        <p className="border-t px-4 py-1.5 text-xs dark:border-white/[0.08] dark:text-[#737373] light:border-black/[0.08] light:text-[#8a8a8a]">
          diagram could not be rendered
        </p>
      </div>
    );
  }

  return (
    <MermaidZoom svg={svg}>
      <div
        data-slot="mermaid-diagram"
        className={cn("rounded-lg p-2 dark:bg-white/[0.04] light:bg-black/[0.035] [&_svg]:mx-auto", className)}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </MermaidZoom>
  );
});

const MERMAID_DARK: Record<string, string> = {
  fontSize: "15px",
  primaryColor: "#7c2d12",
  primaryTextColor: "#ffedd5",
  primaryBorderColor: "#f59e0b",
  lineColor: "#f59e0b",
  secondaryColor: "#3f3f46",
  secondaryTextColor: "#fafafa",
  tertiaryColor: "#166534",
  tertiaryTextColor: "#dcfce7",
  textColor: "#e4e4e7",
  clusterBkg: "#18181b",
  clusterBorder: "#52525b",
  edgeLabelBackground: "#18181b",
};
const MERMAID_LIGHT: Record<string, string> = {
  fontSize: "15px",
  primaryColor: "#fde68a",
  primaryTextColor: "#7c2d12",
  primaryBorderColor: "#d97706",
  lineColor: "#b45309",
  secondaryColor: "#e5e7eb",
  secondaryTextColor: "#111827",
  tertiaryColor: "#bbf7d0",
  tertiaryTextColor: "#14532d",
  textColor: "#1f2937",
  clusterBkg: "#fffaf0",
  clusterBorder: "#d6c6a3",
  edgeLabelBackground: "#fffaf0",
};
