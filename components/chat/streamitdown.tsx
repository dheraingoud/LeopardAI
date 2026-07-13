"use client";

/**
 * StreamItDown — leopard's streaming-safe markdown renderer.
 *
 * Replaces the bare react-markdown call in the transcript with:
 *   - shiki dual-theme syntax highlighting (github-dark-default +
 *     github-light-default) via a module-scope singleton highlighter, loaded
 *     through a dynamic import so the grammar/wasm stays out of the SSR
 *     bundle. Token colors swap by CSS vars (--shiki-dark / --shiki-light)
 *     so a single highlighted string reads correctly in both modes — no
 *     re-highlight on theme flip (see globals.css `.shiki span` rules).
 *   - Per code-block chrome: language badge + copy (sonner toast) + a
 *     collapse/expand gate for long blocks (max-h gate, expands to full).
 *   - Streaming-safe: while `streaming` is true every fenced block renders
 *     as a plain `<pre>` (no shiki call) so partial tokens never trigger a
 *     re-highlight each delta; on `streaming=false` the effect fires once and
 *     highlights the final text. `useDeferredValue(content)` keeps the parse
 *     stable across rapid deltas.
 *   - mermaid: ```` ```mermaid ```` fenced blocks lazy-import mermaid
 *     (client-only) and render INLINE in the chat (no overlay canvas) with
 *     native pointer-drag pan + wheel zoom + reset/fit + code-view +
 *     fullscreen chrome — no svg-pan-zoom dep. Other fenced langs route to
 *     shiki.
 *   - math: inline ($...$) + block ($$...$$) via remark-math → KaTeX
 *     (`rehype-katex` + katex CSS in globals). Streaming-safe: partial
 *     math tokens are stripped to plain text until `streaming=false` so
 *     KaTeX never re-typesets mid-stream.
 *
 * Pure renderer — owns NO scroll logic. Stick-to-bottom + jump-to-bottom
 * lives in messages.tsx (scrollRef + stickToBottomRef); StreamItDown just
 * turns text into DOM.
 */
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";
import { createHighlighter, type Highlighter } from "shiki";
import { useTheme } from "@/components/theme-provider";
import { cn, sanitizeText } from "@/lib/utils";

// ── shiki singleton ────────────────────────────────────────────────────────
// Same SHIKI_LANGS / THEMES as before; includes aliases (js→javascript etc.).
const SHIKI_LANGS = [
  "plaintext", "javascript", "typescript", "tsx", "jsx", "json", "jsonc",
  "css", "html", "markdown", "mdx", "yaml", "python", "bash", "shell",
  "sh", "go", "rust", "cpp", "c", "csharp", "java", "kotlin", "ruby",
  "php", "sql", "diff", "graphql", "vue", "svelte", "xml", "toml", "ini",
  "dockerfile", "docker", "bat", "powershell", "makefile", "nginx", "regex",
];
const SHIKI_THEMES = [
  "github-dark-default",
  "github-light-default",
] as const;

let hlPromise: Promise<Highlighter> | null = null;
function getHighlighter(): Promise<Highlighter> {
  if (!hlPromise) {
    hlPromise = createHighlighter({
      themes: [...SHIKI_THEMES],
      langs: SHIKI_LANGS,
    });
  }
  return hlPromise;
}

function highlight(
  hl: Highlighter,
  lang: string,
  code: string,
): string | null {
  const opts = {
    lang: lang || "plaintext",
    themes: { dark: "github-dark-default", light: "github-light-default" },
    defaultColor: false,
  } as const;
  try {
    return hl.codeToHtml(code, opts);
  } catch {
    try {
      return hl.codeToHtml(code, { ...opts, lang: "plaintext" });
    } catch {
      return null;
    }
  }
}

function extractText(node: ReactNode): string {
  if (node == null || node === false) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in (node as any)) {
    return extractText((node as any).props?.children);
  }
  return "";
}

// ── public renderer ───────────────────────────────────────────────────────
export function StreamItDown({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  const deferred = useDeferredValue(sanitizeText(content));
  const components = useMemo(
    () => ({
      pre: (props: any) => <PreBlock {...props} streaming={!!streaming} />,
      code: InlineCode,
    }),
    [streaming],
  );
  return (
    <div className="markdown-body text-[15px] leading-[1.75] dark:text-[#dedede] light:text-[#262626]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        // KaTeX rendering is heavy and not streaming-safe — only run after the
        // stream finishes. While streaming, remark-math passes through plain
        // $...$ and $$...$$ tokens unchanged, with KaTeX kicking in on the
        // next useDeferredValue commit.
        skipHtml={false}
        urlTransform={(u) => u}
        components={components}
      >
        {streaming ? deferred.replace(/\$\$([^$]+)\$\$/g, "$1") : deferred}
     </ReactMarkdown>
   </div>
  );
}

function InlineCode({ className, children, ...rest }: any) {
  return (
    <code className={className} {...rest}>
      {children}
   </code>
  );
}

// ── fenced code block: chrome + shiki/plain switch + mermaid router ───────
function PreBlock({
  children,
  streaming,
}: {
  children?: ReactNode;
  streaming: boolean;
}) {
  const child = Array.isArray(children) ? children[0] : children;
  const cls: string = (child as any)?.props?.className ?? "";
  const langMatch = /language-([\w-]+)/.exec(cls);
  const lang = langMatch ? langMatch[1] : "";
  const text = extractText((child as any)?.props?.children);
  const lineCount = (text.match(/\n/g)?.length ?? 0) + 1;
  const longBlock = lineCount > 16;

  if (lang === "mermaid") {
    return streaming ? (
      <PreShell lang="mermaid" copyText={text} longBlock={false}>
        <div className="cb-mermaid-loading">rendering diagram…</div>
     </PreShell>
    ) : (
      <MermaidBlock code={text} />
    );
  }

  return (
    <PreShell lang={lang} copyText={text} longBlock={longBlock}>
      <CodeBody lang={lang} text={text} streaming={streaming} />
   </PreShell>
  );
}

function PreShell({
  lang,
  copyText,
  longBlock,
  children,
}: {
  lang: string;
  copyText: string;
  longBlock: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true);
      toast.success("Copied code");
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="cb-shell">
      <div className="cb-header">
        <span className="cb-badge">{lang || "text"}</span>
        <div className="cb-btns">
          <button
            type="button"
            onClick={handleCopy}
            className="cb-btn"
            aria-label="Copy code"
            title={
              lang === "math" || lang === "latex" || lang === "tex"
                ? "Copy LaTeX"
                : "Copy code"
            }
          >
            {copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
         </button>
          {longBlock && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="cb-btn"
              aria-label={expanded ? "Collapse code" : "Expand code"}
            >
              {expanded ? "less" : "more"}
           </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="cb-btn"
            aria-label={collapsed ? "Expand block" : "Collapse block"}
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform duration-200",
                collapsed && "rotate-[-90deg]",
              )}
            />
         </button>
       </div>
     </div>
      <div
        className={cn(
          "cb-body",
          collapsed && "cb-collapsed",
          longBlock && !expanded && !collapsed && "cb-gated",
        )}
      >
        {children}
     </div>
   </div>
  );
}

function CodeBody({
  lang,
  text,
  streaming,
}: {
  lang: string;
  text: string;
  streaming: boolean;
}) {
  const html = useHighlightedHtml(lang, text, streaming);
  if (!html) {
    return (
      <pre className="cb-plain">
        <code>{text}</code>
     </pre>
    );
  }
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function useHighlightedHtml(
  lang: string,
  text: string,
  streaming: boolean,
): string | null {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    if (streaming) {
      setHtml(null);
      return;
    }
    let active = true;
    void getHighlighter().then((hl) => {
      if (!active) return;
      const out = highlight(hl, lang, text);
      if (active && out !== null) setHtml(out);
    });
    return () => {
      active = false;
    };
  }, [lang, text, streaming]);
  return html;
}

// ── mermaid → SVG (anti-AI-slop). Render INLINE in chat with a pan/zoom
// viewport. Floating chrome: zoom-out / reset% / zoom-in / fit / code / full.
// Professional look: ui-monospace labels (no lucide icons), per-mode ink+papwer
// color tokens, no emoji stance. Native PointerEvents → wheel zoom, drag-to-pan,
// double-click zoom. Esc closes fullscreen.
function MermaidBlock({ code }: { code: string }) {
  const rawId = useId();
  const id = `mmd-${rawId.replace(/[^a-zA-Z0-9-]/g, "")}`;
  const { theme } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Mode toggle: "diagram" (default) ↔ "code" (raw source-as-code). State +
  // PreShell host keep copy/collapse affordances working in both modes.
  const [mode, setMode] = useState<"diagram" | "code">("diagram");
  // Fullscreen: zoom up the viewport in-place. Esc closes.
  const [fullscreen, setFullscreen] = useState(false);
  // Hint state: fades in shortly after entering fullscreen so the chrome
  // "greets differently" than the inline mode. Auto-fades after a few s.
  const [fsHint, setFsHint] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    baseTx: number;
    baseTy: number;
    baseScale: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    baseTx: 0,
    baseTy: 0,
    baseScale: 1,
  });
  const [{ z, tx, ty }, setView] = useState({ z: 1, tx: 0, ty: 0 });

  // Esc closes fullscreen. Window-level listener because the inner viewport
  // can't always catch keyboard focus after a click on the chrome buttons.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // When entering fullscreen, fade the interaction hint in (~60ms after
  // mount so the first paint settles) and auto-hide after ~5.5s. Exiting
  // fullscreen collapses the hint back to opacity 0 via the inline
  // transition below.
  useEffect(() => {
    if (!fullscreen) {
      setFsHint(false);
      return;
    }
    const fadeIn = setTimeout(() => setFsHint(true), 60);
    const fadeOut = setTimeout(() => setFsHint(false), 5500);
    return () => {
      clearTimeout(fadeIn);
      clearTimeout(fadeOut);
    };
  }, [fullscreen]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        // Per-theme ink tokens. The "base" theme is the only one that reads
        // all of themeVariables — "default"/"dark" override them out. We push
        // paper + ink colours per mode so the diagram reads as a continuation
        // of the transcript rather than a McMermaid paste.
        const inkTokens =
          theme === "light"
            ? {
                primaryColor: "#fff5e0",
                primaryTextColor: "#1f1607",
                primaryBorderColor: "#d49600",
                lineColor: "#3a2a08",
                secondaryColor: "#fdeec9",
                tertiaryColor: "#f8e2ad",
                background: "#fffaf0",
                fontFamily:
                  "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace",
                fontSize: "13px",
              }
            : {
                primaryColor: "#1c1608",
                primaryTextColor: "#f6e8cc",
                primaryBorderColor: "#ffb400",
                lineColor: "#a8927a",
                secondaryColor: "#211a0c",
                tertiaryColor: "#2a2010",
                background: "#0c0a06",
                fontFamily:
                  "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace",
                fontSize: "13px",
              };
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "loose",
          themeVariables: inkTokens,
          flowchart: {
            curve: "basis",
            htmlLabels: false,
            padding: 12,
            nodeSpacing: 32,
            rankSpacing: 36,
          },
        });
        const { svg: out } = await mermaid.render(id, code);
        if (active) setSvg(out);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [code, theme, id]);

  // After the SVG lands, fit it. Transform-origin is 0 0 by design (so pan
  // math is sane); vertical centering is achieved by computing the offset
  // here rather than via CSS.
  useEffect(() => {
    if (!svg) return;
    queueMicrotask(() => fitToWidth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg]);

  function fitToWidth() {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    const svgEl = inner.querySelector("svg") as SVGSVGElement | null;
    if (!svgEl) return;
    const w = svgEl.viewBox?.baseVal?.width ?? svgEl.clientWidth ?? 0;
    const h = svgEl.viewBox?.baseVal?.height ?? svgEl.clientHeight ?? 0;
    const target = wrap.clientWidth - 24;
    if (!w || target < 64) return;
    const next = Math.max(0.25, Math.min(2, target / w));
    const txFit = Math.max(0, (wrap.clientWidth - w * next) / 2);
    const tyFit = Math.max(0, (wrap.clientHeight - h * next) / 2);
    setView({ z: next, tx: txFit, ty: tyFit });
    inner.style.transform = `translate(${txFit}px, ${tyFit}px) scale(${next})`;
  }

  // Center the diagram at a given absolute zoom level (used by double-click
  // and the initial fullscreen-render). Avoids relying on transform-origin.
  function fitToZoom(target: number) {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    const svgEl = inner.querySelector("svg") as SVGSVGElement | null;
    if (!svgEl) return;
    const w = svgEl.viewBox?.baseVal?.width ?? svgEl.clientWidth ?? 0;
    const h = svgEl.viewBox?.baseVal?.height ?? svgEl.clientHeight ?? 0;
    if (!w || !h) return;
    const next = Math.max(0.25, Math.min(6, target));
    const txFit = Math.max(0, (wrap.clientWidth - w * next) / 2);
    const tyFit = Math.max(0, (wrap.clientHeight - h * next) / 2);
    setView({ z: next, tx: txFit, ty: tyFit });
    inner.style.transform = `translate(${txFit}px, ${tyFit}px) scale(${next})`;
  }

  function zoomBy(delta: number) {
    setView((v) => {
      const next = Math.max(0.25, Math.min(6, v.z + delta));
      const nz = { ...v, z: next };
      queueMicrotask(() => {
        if (innerRef.current) {
          innerRef.current.style.transform = `translate(${nz.tx}px, ${nz.ty}px) scale(${nz.z})`;
        }
      });
      return nz;
    });
  }
  function reset() {
    fitToZoom(1);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!innerRef.current) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      baseTx: tx,
      baseTy: ty,
      baseScale: z,
    };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d.active || !innerRef.current) return;
    const nx = d.baseTx + (e.clientX - d.startX);
    const ny = d.baseTy + (e.clientY - d.startY);
    innerRef.current.style.transform = `translate(${nx}px, ${ny}px) scale(${d.baseScale})`;
    setView((v) => ({ ...v, tx: nx, ty: ny }));
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? -0.15 : 0.15);
  }
  function onDoubleClick(e: React.MouseEvent) {
    e.preventDefault();
    fitToZoom(z >= 4 ? 1 : 2);
  }

  // Fail-safe: drop back to plain PreBlock so the source at least copies.
  if (failed) {
    return (
      <PreShell lang="mermaid" copyText={code} longBlock={false}>
        <pre className="cb-plain">
          <code>{code}</code>
       </pre>
     </PreShell>
    );
  }

  // Code view: raw source inside PreShell. `diagram` button restores.
  if (mode === "code") {
    return (
      <PreShell lang="mermaid" copyText={code} longBlock={false}>
        <pre className="cb-plain">
          <code>{code}</code>
       </pre>
        <div
          className="cb-mermaid-chrome cb-mermaid-chrome-left"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="View diagram"
            className="cb-mermaid-btn"
            onClick={() => setMode("diagram")}
          >
            diagram
         </button>
       </div>
     </PreShell>
    );
  }

  const viewport = (
    <div
      ref={wrapRef}
      className={cn(
        "cb-mermaid-viewport",
        fullscreen && "cb-mermaid-viewport-fs",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      role="img"
      aria-label="Interactive mermaid diagram — drag to pan, wheel or +/− to zoom, double-click to refit"
    >
      <div ref={innerRef} className="cb-mermaid-canvas">
        {svg ? (
          <div
            className="cb-mermaid"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="cb-mermaid-loading">rendering diagram…</div>
        )}
     </div>
       <div
        aria-hidden={!fullscreen}
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          maxWidth: "calc(100% - 220px)",
          padding: "4px 8px",
          borderRadius: 6,
          background:
            theme === "light"
              ? "rgba(252, 248, 233, 0.92)"
              : "rgba(20, 20, 22, 0.78)",
          border:
            theme === "light"
              ? "1px solid rgba(0, 0, 0, 0.06)"
              : "1px solid rgba(255, 255, 255, 0.06)",
          backdropFilter: "blur(8px)",
          color: theme === "light" ? "#3a2a08" : "#f6e8cc",
          fontFamily:
            "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace",
          fontSize: 11,
          letterSpacing: "0.02em",
          lineHeight: 1.4,
          pointerEvents: "none",
          opacity: fsHint ? 1 : 0,
          transform: fsHint ? "translateY(0)" : "translateY(-6px)",
          transition:
            "opacity 320ms ease, transform 320ms cubic-bezier(0.16, 1, 0.3, 1)",
          zIndex: 2,
        }}
      >
        Interactive mermaid diagram — drag to pan, wheel or +/- to zoom, double-click to refit
    </div>
     <div
        className="cb-mermaid-chrome"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Zoom out"
          className="cb-mermaid-btn"
          onClick={() => zoomBy(-0.25)}
        >
          −
       </button>
        <button
          type="button"
          aria-label="Reset zoom"
          className="cb-mermaid-btn cb-mermaid-btn-z"
          onClick={reset}
        >
          {Math.round(z * 100)}%
       </button>
        <button
          type="button"
          aria-label="Zoom in"
          className="cb-mermaid-btn"
          onClick={() => zoomBy(0.25)}
        >
          +
       </button>
        <button
          type="button"
          aria-label="Fit to width"
          className="cb-mermaid-btn"
          onClick={fitToWidth}
        >
          fit
       </button>
        <span className="cb-mermaid-sep" aria-hidden="true" />
        <button
          type="button"
          aria-label="View source"
          className="cb-mermaid-btn"
          onClick={() => setMode("code")}
        >
          code
       </button>
        <button
          type="button"
          aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          className="cb-mermaid-btn"
          onClick={() => setFullscreen((f) => !f)}
        >
          {fullscreen ? "exit" : "expand"}
       </button>
     </div>
   </div>
  );

  if (fullscreen) {
    return (
      <PreShell lang="mermaid" copyText={code} longBlock={false}>
        <div className="cb-mermaid-fullscreen">{viewport}</div>
     </PreShell>
    );
  }
  return (
    <PreShell lang="mermaid" copyText={code} longBlock={false}>
      {viewport}
   </PreShell>
  );
}
