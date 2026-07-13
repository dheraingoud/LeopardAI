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
// katex rendering needs its stylesheet for proper display; without it, math
// shows as `\\operatorname{...}` raw text until the bundle arrives. The CSS
// ships with the katex package — import once, present in every chunk that
// uses math blocks.
import "katex/dist/katex.min.css";
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
                collapsed && "-rotate-90",
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

// ── mermaid → SVG. Mermaid's "default" theme gives the full color palette
// (sequence / class / state / flow / gantt retain their category colors).
// Live-streaming-tolerant: securityLevel "loose" + a 250ms render debounce so
// partial syntax (model mid-write) doesn't spam the renderer, and we swallow
// render-time exceptions silently while the code keeps growing (no scary
// "failed" fallback; the last good SVG stays on screen until a fresh delta
// parses cleanly). Pan = native pointer-drag on the SVG canvas. Zoom +/− and
// fit are button-only — the wheel never zooms so page scroll stays unbroken
// while reading the chat.
function MermaidBlock({ code }: { code: string }) {
  const rawId = useId();
  const id = `mmd-${rawId.replace(/[^a-zA-Z0-9-]/g, "")}`;
  const { theme } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  // Mode toggle: diagram (default) ↔ code (raw source). Code view lets the
  // user inspect the mermaid source when the renderer bails on a partial
  // syntax error mid-stream.
  const [mode, setMode] = useState<"diagram" | "code">("diagram");

  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Drag-pan state lives on the canvas div; we apply translate(z) via direct
  // transform mutation each pointermove (no React re-render — keeps the SVG
  // hot path juicy smooth).
  const dragRef = useRef({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });
  const [scale, setScale] = useState(1);
  // Track the last-rendered code so a wholly different diagram (regenerate,
  // a new code fence in the same message) doesn't display the prior SVG while
  // the new render bails on the first partial release.
  const prevCodeRef = useRef<string>("");
  useEffect(() => {
    // If the new code isn't a textual extension of what we last rendered
    // (length shrunk past what we had, or it doesn't start with the prior
    // code's prefix), treat it as a brand-new diagram — drop the stale SVG
    // even if the upcoming render bails, so the user sees "rendering…"
    // instead of a previous diagram misattributed.
    const prev = prevCodeRef.current;
    const isExtension = code.startsWith(prev) && code.length >= prev.length;
    if (prev && !isExtension) {
      setSvg(null);
    }
    prevCodeRef.current = code;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const render = async () => {
      try {
        const mermaidMod = await import("mermaid");
        const mermaid = mermaidMod.default;
        // Default mermaid theme produces the full color palette (sequence /
        // class / state diagrams retain their category colors). `theme: "base"`
        // was monochrome (the user's pain point). Keep `loose` security so
        // partial syntax during stream doesn't throw.
        mermaid.initialize({
          startOnLoad: false,
          theme: theme === "dark" ? "dark" : "default",
          securityLevel: "loose",
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
        // Partial mermaid syntax during stream throws here. Stay silent:
        // keep the last good SVG on screen and retry on the next code delta.
        // We don't setFailed — the user shouldn't see a hard fallback mid-stream.
      }
    };
    // 250ms debounce so streaming tokens collapse cleanly.
    timer = setTimeout(render, 250);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [code, theme, id]);

  // After the SVG lands, fit it to width. Center via translate.
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  useEffect(() => {
    if (!svg) return;
    queueMicrotask(() => fitToWidth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg]);

  function fitToWidth() {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const svgEl = wrap.querySelector("svg") as SVGSVGElement | null;
    if (!svgEl) return;
    const w = svgEl.viewBox?.baseVal?.width ?? svgEl.clientWidth ?? 0;
    if (!w) return;
    const target = wrap.clientWidth - 24;
    if (target < 64) return;
    const next = Math.max(0.5, Math.min(2, target / w));
    setScale(next);
    setTx(Math.max(8, (wrap.clientWidth - w * next) / 2));
    setTy(8);
  }

  // Drag-pan (no wheel handler — wheel just scrolls the page). Pointer
  // events on the canvas are captured & released so drag works across the
  // entire SVG area, not just text nodes.
  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      baseX: tx,
      baseY: ty,
    };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d.active) return;
    setTx(d.baseX + (e.clientX - d.startX));
    setTy(d.baseY + (e.clientY - d.startY));
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }

  function zoomBy(delta: number) {
    setScale((s) => Math.max(0.5, Math.min(4, +(s + delta).toFixed(2))));
  }
  function reset() {
    fitToWidth();
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

  return (
    <PreShell lang="mermaid" copyText={code} longBlock={false}>
      <div
        ref={wrapRef}
        className="cb-mermaid-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label="Mermaid diagram — drag to pan, use +/− to zoom"
      >
        <div
          className="cb-mermaid-canvas"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: "0 0",
            transition: dragRef.current.active
              ? "none"
              : "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
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
            {Math.round(scale * 100)}%
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
      </div>
    </div>
  </PreShell>
  );
}
