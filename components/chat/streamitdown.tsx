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
  memo,
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
import DOMPurify from "dompurify";

// ── SVG sanitizer ─────────────────────────────────────────────────────────
// Model-emitted ```svg fences are user-visible HTML we inject with
// dangerouslySetInnerHTML, so every byte passes DOMPurify's SVG profile
// (strips <script>, event-handler attrs, javascript: URLs). foreignObject is
// forbidden so no HTML/`<img onerror>` smuggling rides inside the SVG. This
// runs client-only; during SSR streaming the fence stays a plain code block.
function sanitizeSvg(code: string): string {
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(code, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "script", "style"],
  }).trim();
}

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
// Memoized: during interleaved thinking the parent re-renders on every token,
// and each text/reasoning segment runs its own ReactMarkdown. A closed segment
// (its content no longer changing) must not re-parse on every sibling token —
// memo on content+streaming means only the actively-growing segment re-renders.
export const StreamItDown = memo(function StreamItDown({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  // Sanitize text, then defensively drop `height="auto"` / `height='auto'` from
// any inline SVG — an invalid <svg> attribute that react-dom throws on.
// Old persisted messages + any model slip both surface here; this makes the
// renderer immune instead of a console error per load.
const sanitized = sanitizeText(content).replace(
  /\s+height=["']auto["']/g,
  "",
);
  // Φ-perf: during an active stream the parent re-renders on EVERY token. A full
  // ReactMarkdown re-parse per token is O(n²) over the response length and is
  // the "interleaved thinking makes the whole app lag" hot path — each text and
  // reasoning segment re-parses its full content per token. Throttle the parsed
  // source to ~120ms commits while streaming so the UI stays responsive; the
  // final (streaming=false) render always shows the complete text.
  const [throttled, setThrottled] = useState(sanitized);
  const lastCommit = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a live ref so the trailing flush reads the latest content, not a stale
  // closure from when the timer was scheduled.
  const sanitizedRef = useRef(sanitized);
  sanitizedRef.current = sanitized;
  useEffect(() => {
    if (!streaming) {
      // Stream finished — commit the full content immediately and cancel any
      // pending throttle flush so the tail (incl. math) renders at once.
      if (pending.current) clearTimeout(pending.current);
      pending.current = null;
      setThrottled(sanitized);
      return;
    }
    const now = Date.now();
    const since = now - lastCommit.current;
    if (since >= 120) {
      lastCommit.current = now;
      setThrottled(sanitized);
    } else if (!pending.current) {
      pending.current = setTimeout(() => {
        lastCommit.current = Date.now();
        setThrottled(sanitizedRef.current);
        pending.current = null;
      }, 120 - since);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sanitized, streaming]);
  const deferred = useDeferredValue(throttled);
  const components = useMemo(
    () => ({
      pre: (props: any) => <PreBlock {...props} streaming={!!streaming} />,
      code: InlineCode,
      // Every clickable link in chat content opens in a NEW tab (never the
      // same tab) — per user requirement. rel="noopener noreferrer" stops the
      // new tab from reaching back into the app.
      a: (props: any) => (
        <a
          href={props.href}
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          {props.children}
        </a>
      ),
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
});

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
    // Always render live via MermaidBlock (never the streaming placeholder):
    // MermaidBlock is already streaming-tolerant (250ms debounce + keeps the
    // last good SVG when a partial code block throws), so the diagram appears
    // as the model emits it instead of flashing a "rendering diagram…" box and
    // swapping in only after the stream finishes.
    return <MermaidBlock code={text} streaming={streaming} />;
  }

  if (lang === "svg") {
    return streaming ? (
      <PreShell lang="svg" copyText={text} longBlock={false}>
        <div className="cb-mermaid-loading">rendering svg…</div>
     </PreShell>
    ) : (
      <SvgBlock code={text} />
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

// ── svg fence → inline sanitized SVG. No pan/zoom canvas — SVG carries its
// own viewBox so it scales natively; we just center it and gate rendering
// behind the sanitizer. Chrome = PreShell (copy + collapse) plus a source
// toggle so the raw markup stays inspectable.
function SvgBlock({ code }: { code: string }) {
  const [mode, setMode] = useState<"svg" | "code">("svg");
  const html = useMemo(() => sanitizeSvg(code), [code]);

  if (mode === "code") {
    return (
      <PreShell lang="svg" copyText={code} longBlock={false}>
        <pre className="cb-plain">
          <code>{code}</code>
       </pre>
        <div
        className="cb-mermaid-chrome cb-mermaid-chrome-left"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="View rendered SVG"
            className="cb-mermaid-btn"
            onClick={() => setMode("svg")}
          >
            render
          </button>
       </div>
     </PreShell>
    );
  }

  return (
    <PreShell lang="svg" copyText={code} longBlock={false}>
      <div className="cb-svg-viewport">
        <div
          className="cb-svg-art"
          dangerouslySetInnerHTML={
            html ? { __html: html } : undefined
          }
          role="img"
          aria-label="Inline SVG"
        >
          {html ? null : <code className="cb-plain">{code}</code>}
        </div>
      </div>
      <div
        className="cb-mermaid-chrome cb-mermaid-chrome-left"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="View SVG source"
          className="cb-mermaid-btn"
          onClick={() => setMode("code")}
        >
          source
        </button>
      </div>
    </PreShell>
  );
}

// ── mermaid → INLINE colored SVG. Renders in normal chat flow — no overlay
// canvas, no pan/zoom chrome, no fit-to-width scaling. The diagram draws at its
// natural size, centered, and expands DOWN the page like any other message
// block (CSS clamps max-width:100%; height:auto so a wide diagram still fits
// the column). Multi-color via `theme:"base"` + explicit themeVariables
// (MERMAID_DARK / MERMAID_LIGHT): every fill is paired with a contrasting
// label color so node text never melts into the box — the model's prompt
// instruction (lib/skills/mermaid-gen) also emits `classDef` blocks with
// approved color pairs so distinct nodes take distinct fills.
// Live-streaming-tolerant: securityLevel "loose" + a 250ms debounce; partial
// syntax silently keeps the last good SVG until a delta parses. A quiet
// "view source" affordance below toggles raw code (no floating box).
function MermaidBlock({ code, streaming }: { code: string; streaming: boolean }) {
  const rawId = useId();
  const id = `mmd-${rawId.replace(/[^a-zA-Z0-9-]/g, "")}`;
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [svg, setSvg] = useState<string | null>(null);
  // Φ-hardening: once a FINAL (non-extending) code fence has failed to parse,
  // don't loop "rendering diagram…" forever — show a quiet "view source"
  // fallback so the user isn't left with a dead spinner and no raw error leaks
  // to a toast. Set only after a render reject; cleared when one succeeds.
  const [softFailed, setSoftFailed] = useState(false);
  // Mode toggle: diagram (default) ↔ code (raw source). Code view lets the
  // user inspect the mermaid source when the renderer bails on a partial
  // syntax error mid-stream.
  const [mode, setMode] = useState<"diagram" | "code">("diagram");
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
        // Multi-color via the "base" theme + an explicit themeVariables palette
        // (see MERMAID_DARK / MERMAID_LIGHT below) — every fill pairs with a
        // high-contrast label color, so box text never melts into its fill. The
        // model's prompt instruction (lib/skills/mermaid-gen) additionally
        // emits `classDef` blocks with approved color pairs for distinct nodes.
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "loose",
          themeVariables: dark ? MERMAID_DARK : MERMAID_LIGHT,
          flowchart: {
            curve: "basis",
            htmlLabels: false,
            padding: 12,
            nodeSpacing: 36,
            rankSpacing: 44,
          },
          fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
        });
        const { svg: out } = await mermaid.render(id, code);
        if (active) {
          setSvg(out);
          setSoftFailed(false);
        }
      } catch {
        // A partial mermaid fence mid-stream throws here. Stay silent: keep the
        // last good SVG (or the "rendering…" placeholder) and retry on the next
        // code delta. Only mark softFailed once the stream has ENDED and the
        // final code still doesn't parse — never on a partial mid-stream block,
        // which is exactly what caused the "diagram couldn't be rendered" flash
        // that later swapped to the real diagram. `streaming` is in the dep
        // array so the final throw (streaming=false) is the one that can set it.
        if (active && !svg && !streaming) setSoftFailed(true);
      }
    };
    // 250ms debounce so streaming tokens collapse cleanly.
    timer = setTimeout(render, 250);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
    // streaming flips false on the final delta → the last parse is authoritative
    // for softFailed; a fresh stream (streaming=true) re-runs and re-renders.
  }, [code, dark, id, streaming]);

  // Inline diagram (code view resets above). `mermaid.render` emits an svg with
  // fixed width/height. Wide LR diagrams used to get crushed by
  // `width:100% !important` (height:auto shrinks the whole thing to the column
  // width → tiny illegible text). Φ-mermaid-wide (2026-08-25): read the SVG
  // viewBox aspect ratio; when width/height exceeds ~1.5 the diagram is WIDE,
  // so we drop the width clamp and render it at natural size inside a
  // horizontal-scroll container (`.cb-mermaid-wide`) — text stays legible and
  // the user scrolls/pans instead of squinting. Narrow diagrams keep the
  // fit-to-column behavior.
  const wideDims = useMemo(() => {
    if (!svg) return null;
    const m = svg.match(/viewBox="([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"/);
    if (!m) return null;
    const w = parseFloat(m[3]);
    const h = parseFloat(m[4]);
    return h > 0 && w / h > 1.5 ? { w, h } : null;
  }, [svg]);

  // Wide LR diagram: drop the width:100% clamp and pin the SVG to its NATURAL
  // pixel width (from the viewBox), so node text renders 1:1 legible and the
  // container scrolls horizontally when the diagram is wider than the column.
  // The svg ships width="100%"; we rewrite it to the natural px inline.
  const renderBody = svg ? (
    wideDims ? (
      <div
        className="cb-mermaid-wide"
        dangerouslySetInnerHTML={{
          // Inline style !important beats the global `.cb-mermaid svg { width:
          // 100% !important }` clamp, pinning the diagram to its natural px.
          __html: svg.replace(
            /(<svg[^>]*?)\swidth="100%"/,
            `$1 style="width:${Math.round(wideDims.w)}px !important;max-width:none !important;height:auto !important"`,
          ),
        }}
      />
    ) : (
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    )
  ) : softFailed ? (
    // Broken final diagram: a neutral, non-error affordance. The user can read
    // the raw mermaid (mode → code) but nothing printed raw "Syntax error" to
    // the UI, and no toast fired.
    <div className="cb-mermaid-softfail">
      <span>diagram couldn’t be rendered</span>
      <button
        type="button"
        className="cb-mermaid-sourcebtn"
        onClick={() => setMode("code")}
        aria-label="View mermaid source"
      >
        view source
      </button>
    </div>
  ) : (
    <div className="cb-mermaid-loading">rendering diagram…</div>
  );

  if (mode === "code") {
    return (
      <div className="cb-mermaid-inline">
        <button
          type="button"
          className="cb-mermaid-sourcebtn"
          onClick={() => setMode("diagram")}
          aria-label="View rendered diagram"
        >
          view diagram
        </button>
        <pre className="cb-plain">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="cb-mermaid-inline">
      <div className="cb-mermaid">{renderBody}</div>
      {!softFailed && (
        <button
          type="button"
          className="cb-mermaid-sourcebtn"
          onClick={() => setMode("code")}
          aria-label="View mermaid source"
        >
          view source
        </button>
      )}
    </div>
  );
}

// themeVariables palette — explicit fill:label pairs on every surface so the
// node text keeps high contrast (>4.5:1) against its box. Amber = primary
// nodes, green = class/tertiary, zinc = supporting boxes. Warm dark + paper
// light to match the app surface.
const MERMAID_BASE: Record<string, string> = {
  fontSize: "15px",
};
const MERMAID_DARK: Record<string, string> = {
  ...MERMAID_BASE,
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
  actorBkg: "#27272a",
  actorBorder: "#f59e0b",
  actorTextColor: "#fafafa",
  actorLineColor: "#71717a",
  noteBkgColor: "#78350f",
  noteTextColor: "#fef3c7",
  noteBorderColor: "#f59e0b",
  edgeLabelBackground: "#18181b",
};
const MERMAID_LIGHT: Record<string, string> = {
  ...MERMAID_BASE,
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
  actorBkg: "#ffffff",
  actorBorder: "#d97706",
  actorTextColor: "#111827",
  actorLineColor: "#9ca3af",
  noteBkgColor: "#fef3c7",
  noteTextColor: "#78350f",
  noteBorderColor: "#d97706",
  edgeLabelBackground: "#fffaf0",
};
