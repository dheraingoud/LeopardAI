"use client";

// Leopard StreamingText — fork of the kit streaming/markdown renderer, merged
// with leopard's full pipeline: shiki dual-theme highlighting (settled blocks
// only), mermaid (live, debounced, natural-size), KaTeX math (settled only),
// DOMPurify'd svg fences, fence-aware block memoization, 48ms streaming
// throttle, amber tail + single caret. Owns NO scroll logic (messages.tsx).

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Check, ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";
import { cn, sanitizeText } from "@/lib/utils";
import { normalizeMathDelimiters, escapeCurrencyDollars } from "@/lib/markdown-preprocess";
import { ImageLightbox } from "./image-lightbox";
import { CodeRunOutput, RunButton } from "./code-runner";
import { useRunCode } from "@/hooks/use-run-code";
import DOMPurify from "dompurify";
import { FlowGraph, type FlowEdge, type FlowNode } from "./flow-graph";
import { TerminalBlock } from "./terminal-block";
import { CitationLink } from "./inline-citation";
import { BarChart, parseChartSpec, salvageMermaidBarChart } from "./chart";
import { DataTable, parseCsvTable } from "./data-table";
import { SpecSheet, parseSpecSheet } from "./spec-sheet";
import { CodeDiff, parseDiff, type DiffLine } from "./code-diff";
import { ReviewableDiff, type DiffHunk, type HunkDecision } from "./reviewable-diff";
import { useShikiHtml } from "./primitives/shiki-highlighter";
import { tailBoundedRemend } from "@/lib/remend";
import { useSmoothReveal } from "./use-smooth-reveal";

function sanitizeSvg(code: string): string {
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(code, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "script", "style"],
  }).trim();
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

export const StreamingText = memo(function StreamingText({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  // Model output often uses \(...\) / \[...\] / [/math] or currency $ that
  // remark-math won't parse — normalize to $$...$$, escape currency. Ported
  // from aui react-markdown preprocess (battle-tested char-level scanner,
  // fence/blockquote aware). Run BEFORE the fence-aware block split.
  const mathReady = escapeCurrencyDollars(normalizeMathDelimiters(content));
  const sanitized = sanitizeText(mathReady).replace(/\s+height=["']auto["']/g, "");
  // Typewriter reveal (useSmoothReveal):
  // fast NIM token bursts popped whole word-chunks in; the reveal drains the
  // backlog at a bounded rate (250ms drain, 5ms/char floor) so text flows
  // instead of jumping. It commits per animation frame and replaces the old
  // 48ms throttle (the reveal's bounded drain IS the throttle — a full
  // ReactMarkdown pass per frame is bounded by maxCharIntervalMs, not by
  // token arrival). Settled text bypasses the reveal entirely.
  const revealed = useSmoothReveal(sanitized, !!streaming);
  // Fence-aware block split: only the growing tail block re-parses per commit.
  // While streaming, repair dangling openers in the tail (remend, ported from
  // mid-stream `**bold` / open backtick /
  // unclosed link used to render raw or mangle everything after it until the
  // block settled. Settled text is never repaired — the model's final output
  // must render as written.
  const blocks = useMemo(
    () => splitMarkdownBlocks(streaming ? tailBoundedRemend(revealed) : sanitized),
    [revealed, sanitized, streaming],
  );
  return (
    <div className="markdown-body text-[15px] leading-[1.75] dark:text-[#dedede] light:text-[#262626]">
      {blocks.map((b, i) => (
        <MarkdownBlock
          key={i}
          content={b}
          streaming={!!streaming && i === blocks.length - 1}
        />
      ))}
      {/* Sibling caret, inline after the last block — markdown can't carry a
          raw span (no rehype-raw), and the trim gate keeps it off empty tails. */}
      {streaming && content.trim().length > 0 && (
        <span aria-hidden className="leopard-stream-caret" />
      )}
    </div>
  );
});

function splitMarkdownBlocks(src: string): string[] {
  const blocks: string[] = [];
  let cur: string[] = [];
  let inFence = false;
  let fenceChar = "";
  let inMath = false;
  for (const line of src.split("\n")) {
    const fence = /^\s*(```+|~~~+)/.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceChar = fence[1][0];
      } else if (fence[1][0] === fenceChar) {
        inFence = false;
      }
      cur.push(line);
      continue;
    }
    if (!inFence && /^\s*\$\$\s*$/.test(line)) {
      inMath = !inMath;
      cur.push(line);
      continue;
    }
    if (!inFence && !inMath && line.trim() === "") {
      if (cur.length > 0) {
        blocks.push(cur.join("\n"));
        cur = [];
      }
      continue;
    }
    cur.push(line);
  }
  if (cur.length > 0) blocks.push(cur.join("\n"));
  return blocks;
}

const MarkdownBlock = memo(function MarkdownBlock({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}) {
  const components = useMemo(
    () => ({
      pre: (props: any) => <PreBlock {...props} streaming={streaming} />,
      code: InlineCode,
      a: (props: any) => <CitationLink {...props} />,
      // Image lightbox: markdown images were bare
      // <img> with no zoom/download. Click opens the full-size overlay.
      img: (props: any) => <MarkdownImage {...props} />,
    }),
    [streaming],
  );
  return (
    <div
      className={
        streaming
          ? "animate-in fade-in duration-300 motion-reduce:animate-none leopard-fresh-tail"
          : undefined
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        // throwOnError:false (audit 2026-10-09): a malformed $$ block used to
        // throw mid-render and take the message down; now KaTeX renders the
        // source with an error class instead.
        rehypePlugins={streaming ? [] : [[rehypeKatex, { throwOnError: false }]]}
        skipHtml={false}
        // Block dangerous protocols (audit 2026-10-09: pass-through allowed
        // javascript:/data: hrefs from model output — a prompt-injected link
        // would execute). Allow http/https/mailto only.
        urlTransform={(u) =>
          /^(https?:|mailto:)/i.test(u) ? u : ""
        }
        components={components}
      >
        {streaming ? content.replace(/\$\$([^$]+)\$\$/g, "$1") : content}
      </ReactMarkdown>
    </div>
  );
});

// Markdown image: an <img> from model output gets
// the lightbox (full-size preview + download) instead of an inert inline
// render. Wrapped in a button so keyboard users can open it.
function MarkdownImage({ src, alt, ...rest }: any) {
  const [open, setOpen] = useState(false);
  if (typeof src !== "string") return null;
  return (
    <>
      <button
        type="button"
        aria-label={`View ${alt || "image"} full size`}
        onClick={() => setOpen(true)}
        className="my-2 block max-w-full cursor-zoom-in rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#ffb400]/60"
      >
        <img
          src={src}
          alt={alt ?? ""}
          className="max-h-72 max-w-full rounded-xl object-cover dark:border dark:border-white/[0.08]"
          {...rest}
        />
      </button>
      {open && (
        <ImageLightbox
          src={src}
          alt={alt ?? "image"}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function InlineCode({ className, children, ...rest }: any) {
  return (
    <code className={className} {...rest}>
      {children}
    </code>
  );
}

function PreBlock({
  children,
  streaming,
  node,
}: {
  children?: ReactNode;
  streaming: boolean;
  // react-markdown v10 hands the hast node — its children[0].properties
  // .className carries `language-x` even when the rendered child drops it
  // (shiki's highlighted output strips the language class from <code>, which
  // used to zero the badge + the runnable check on settle).
  node?: any;
}) {
  const child = Array.isArray(children) ? children[0] : children;
  const clsFromChild: string = (child as any)?.props?.className ?? "";
  const clsFromNode: string = (() => {
    const codeNode = node?.children?.[0];
    const cls = codeNode?.properties?.className;
    return Array.isArray(cls) ? cls.join(" ") : (typeof cls === "string" ? cls : "");
  })();
  const cls = clsFromChild || clsFromNode;
  const langMatch = /language-([\w-]+)/.exec(cls);
  const langRaw = langMatch ? langMatch[1] : "";
  // Alias model-invented fence names to the structured renderers (misfire
  // hunt 2026-10-09: ```barchart and ```csv rendered as raw source).
  const lang =
    langRaw === "barchart" || langRaw === "bar-chart"
      ? "chart"
      : langRaw === "csv"
        ? "table"
        : langRaw;
  const text = extractText((child as any)?.props?.children);
  const lineCount = (text.match(/\n/g)?.length ?? 0) + 1;
  const longBlock = lineCount > 16;

  if (lang === "mermaid" || lang === "diagram") {
    // Salvage mermaid-ish bar charts (barChart / xychart-beta) into the native
    // BarChart — models invent that syntax for "chart of X by Y" and mermaid
    // can't render it (soft-failed to view-source, audit 2026-10-09 RCA).
    const salvaged = salvageMermaidBarChart(text);
    if (salvaged) return <BarChart title={salvaged.title} series={salvaged.series} />;
    // Warm the shared import the moment the fence is SEEN (during streaming),
    // not 250ms later when the debounce fires — first paint lands sooner.
    void loadMermaid();
    return <MermaidBlock code={text} streaming={streaming} />;
  }

  // `flow` fence — leopard's own node/edge DSL, rendered by the same FlowGraph
  // the subagent card used before (moved out of the card 2026-09-02). Mermaid
  // keeps `mermaid`/`diagram`; `flow` NEVER routes there — no clash.
  if (lang === "flow" || lang === "flowgraph") {
    return <FlowBlock code={text} />;
  }

  // math/latex/tex fences render as display math (audit 2026-10-09): the
  // pre-existing MathBlock branch rendered RAW LaTeX in a <code> tag (the
  // user's "raw source" screenshot); the KaTeX branch below was unreachable
  // behind it. This is the single live branch — $$ wrap so remark-math picks
  // it up, throwOnError:false so a bad formula degrades instead of throwing.
  if (lang === "math" || lang === "latex" || lang === "tex") {
    return (
      <div className="my-3 overflow-x-auto rounded-lg border border-foreground/[0.07] bg-foreground/[0.02] px-4 py-3">
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
        >
          {`$$\n${text.trim()}\n$$`}
        </ReactMarkdown>
      </div>
    );
  }

  if (lang === "terminal" || lang === "console") {
    const lines = text.split("\n");
    return (
      <TerminalBlock
        command={lines[0] ?? ""}
        lines={lines.slice(1)}
        visibleCount={lines.length}
        done={!streaming}
      />
    );
  }

  // Structured-data fences: plain code while streaming; the settled render
  // parses and falls back to the code shell on a bad payload.
  if (lang === "chart" || lang === "table" || lang === "spec") {
    if (streaming) {
      return (
        <PreShell lang={lang} copyText={text} longBlock={longBlock}>
          <CodeBody lang={lang} text={text} streaming />
        </PreShell>
      );
    }
    if (lang === "chart") {
      const spec = parseChartSpec(text);
      if (spec) return <BarChart title={spec.title} series={spec.series} />;
    } else if (lang === "table") {
      const table = parseCsvTable(text);
      if (table)
        return (
          <DataTable
            header={table.header}
            rows={table.rows}
            title="Data table"
          />
        );
    } else {
      const spec = parseSpecSheet(text);
      if (spec) return <SpecSheet title={spec.title} fields={spec.fields} />;
    }
  }

  // Diff fences: plain code while streaming; the settled render becomes a
  // ReviewableDiff (per-hunk keep/discard; Apply copies the kept patch) and
  // falls back to the plain CodeDiff when no hunks split out, then to the
  // code shell when nothing diff-like parsed.
  if (lang === "diff" || lang === "patch") {
    if (!streaming) {
      const diff = parseDiff(text);
      if (diff) {
        const hunks = splitDiffHunks(diff.lines);
        if (hunks.length > 0) {
          return <SettledReviewableDiff filename={diff.filename} hunks={hunks} />;
        }
        return <CodeDiff filename={diff.filename} lines={diff.lines} />;
      }
    } else {
      return (
        <PreShell lang={lang} copyText={text} longBlock={longBlock}>
          <CodeBody lang={lang} text={text} streaming />
        </PreShell>
      );
    }
  }

  if (lang === "svg") {
    // Live render while streaming (250ms debounce) — waiting for the full
    // settle made svg fences appear "after a long long long time" (operator
    // 2026-09-04). DOMPurify tolerates partial markup; a broken partial just
    // renders whatever parses, same as mermaid's live pass.
    return <LiveSvgBlock code={text} streaming={streaming} />;
  }

  return (
    <PreShell lang={lang} copyText={text} longBlock={longBlock}>
      <CodeBody lang={lang} text={text} streaming={streaming} />
    </PreShell>
  );
}

// Runnable code blocks: js/ts fences get a Run button (sandboxed-iframe eval,
// console captured). The output pane slides in below the code.
const RUNNABLE = new Set(["js", "javascript", "mjs", "cjs", "ts", "typescript"]);

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
  const runnable = RUNNABLE.has(lang.toLowerCase());
  const { state: runState, run, reset: resetRun } = useRunCode();

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
        {/* No badge for unlabeled fences — "text" is noise, not information. */}
        {lang && lang !== "text" && lang !== "plaintext" ? (
          <span className="cb-badge">{lang}</span>
        ) : (
          <span />
        )}
        <div className="cb-btns">
          {runnable && <RunButton running={runState.running} onRun={() => run(copyText)} />}
          <button
            type="button"
            onClick={handleCopy}
            className="cb-btn"
            aria-label="Copy code"
            title="Copy code"
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
      {runnable && (
        <CodeRunOutput state={runState} onDismiss={resetRun} />
      )}
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
  const html = useShikiHtml(lang, text, streaming);
  // ONE wrapper element across the plain→shiki settle: the old pre↔div swap
  // unmounted the block's chrome (collapse/copy/run state reset on settle).
  // Keep a stable <div> and only swap the inner content.
  if (!html) {
    return (
      <div className="cb-plain">
        <pre>
          <code>{text}</code>
        </pre>
      </div>
    );
  }
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function LiveSvgBlock({ code, streaming }: { code: string; streaming: boolean }) {
  const [debounced, setDebounced] = useState(code);
  useEffect(() => {
    if (!streaming) {
      setDebounced(code);
      return;
    }
    const t = setTimeout(() => setDebounced(code), 250);
    return () => clearTimeout(t);
  }, [code, streaming]);
  return <SvgBlock key={debounced} code={debounced} />;
}

function SvgBlock({ code }: { code: string }) {
  const [mode, setMode] = useState<"svg" | "code">("svg");
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    px: number;
    py: number;
    ox: number;
    oy: number;
  } | null>(null);
  const html = useMemo(() => sanitizeSvg(code), [code]);

  const applyZoom = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const ns = Math.min(6, Math.max(0.5, v.scale * factor));
      const k = ns / v.scale;
      return { scale: ns, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || mode !== "svg") return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      applyZoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom, mode]);

  const zoomFromCenter = (factor: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    applyZoom(factor, r.width / 2, r.height / 2);
  };

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

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (view.scale <= 1) return;
    dragRef.current = { px: e.clientX, py: e.clientY, ox: view.x, oy: view.y };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setView((v) => ({
      ...v,
      x: d.ox + (e.clientX - d.px),
      y: d.oy + (e.clientY - d.py),
    }));
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <PreShell lang="svg" copyText={code} longBlock={false}>
      <div
        ref={viewportRef}
        className="cb-svg-viewport"
        data-zoomed={view.scale > 1 ? "1" : "0"}
        style={{
          cursor: view.scale > 1 ? (dragging ? "grabbing" : "grab") : "default",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          applyZoom(
            view.scale > 1.5 ? 1 / view.scale : 2 / view.scale,
            e.clientX - r.left,
            e.clientY - r.top,
          );
        }}
      >
        <div
          className="cb-svg-art"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
          dangerouslySetInnerHTML={html ? { __html: html } : undefined}
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
          aria-label="Zoom in"
          className="cb-mermaid-btn"
          onClick={() => zoomFromCenter(1.4)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          className="cb-mermaid-btn"
          onClick={() => zoomFromCenter(1 / 1.4)}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          className="cb-mermaid-btn"
          onClick={() => setView({ scale: 1, x: 0, y: 0 })}
        >
          reset
        </button>
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

// Mermaid: live render with 250ms debounce; partial code keeps the last good
// SVG; failed FINAL code shows a quiet "view source" fallback; error graphics
// mermaid appends to <body> are purged; wide diagrams render at natural size
// in a horizontal scroll container.
// Flow fence DSL: one edge per line `from -> to`, optional node state suffix
// `name[done|active|pending]`. Columns assigned by BFS depth from the roots,
// rows = order within a column. Empty/unparseable input falls back to source.
function FlowBlock({ code }: { code: string }) {
  const [mode, setMode] = useState<"graph" | "code">("graph");
  const parsed = useMemo(() => {
    const stateOf = new Map<string, FlowNode["state"]>();
    const edges: FlowEdge[] = [];
    for (const rawLine of code.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("#")) continue;
      const m = /^(.+?)\s*->\s*(.+)$/.exec(line);
      const readNode = (s: string): string => {
        const sm = /^(.*?)\[(done|active|pending)\]\s*$/.exec(s.trim());
        if (sm) {
          stateOf.set(sm[1].trim(), sm[2] as FlowNode["state"]);
          return sm[1].trim();
        }
        return s.trim();
      };
      if (m) {
        const from = readNode(m[1]);
        const to = readNode(m[2]);
        if (from && to) edges.push({ from, to });
      } else {
        readNode(line); // bare node line — may still carry a [state]
      }
    }
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const e of edges) {
      for (const id of [e.from, e.to]) {
        if (!seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    }
    for (const id of stateOf.keys()) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    if (!ids.length) return null;
    // BFS layering: roots = never a target; depth → column, order → row.
    const targets = new Set(edges.map((e) => e.to));
    const depth = new Map<string, number>();
    const queue = ids.filter((id) => !targets.has(id));
    for (const id of queue) depth.set(id, 0);
    let guard = 0;
    while (queue.length && guard++ < 1000) {
      const cur = queue.shift()!;
      const d = depth.get(cur) ?? 0;
      for (const e of edges) {
        if (e.from !== cur) continue;
        if ((depth.get(e.to) ?? -1) < d + 1) {
          depth.set(e.to, d + 1);
          queue.push(e.to);
        }
      }
    }
    const perColumn = new Map<number, number>();
    const nodes: FlowNode[] = ids.map((id) => {
      const column = depth.get(id) ?? 0;
      const row = perColumn.get(column) ?? 0;
      perColumn.set(column, row + 1);
      return { id, label: id, column, row, state: stateOf.get(id) ?? "done" };
    });
    return { nodes, edges };
  }, [code]);

  if (mode === "code" || !parsed) {
    return (
      <div className="cb-mermaid-inline">
        {parsed && (
          <button
            type="button"
            aria-label="View rendered flow graph"
            className="cb-mermaid-sourcebtn"
            onClick={() => setMode("graph")}
          >
            view graph
          </button>
        )}
        <pre className="cb-plain">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  // Inline (no-canvas) like cb-mermaid-inline: transparent column, quiet
  // mono "view source" row below — same visual contract as mermaid diagrams.
  return (
    <div className="cb-mermaid-inline">
      <FlowGraph
        nodes={parsed.nodes}
        edges={parsed.edges}
        visibleCount={parsed.nodes.length}
        className="border-transparent bg-transparent p-0 shadow-none backdrop-blur-none dark:bg-none light:bg-none"
      />
      <button
        type="button"
        aria-label="View flow source"
        className="cb-mermaid-sourcebtn"
        onClick={() => setMode("code")}
      >
        view source
      </button>
    </div>
  );
}

// Shared mermaid import — one promise for the whole session. Without this the
// 250ms-debounced render paid a fresh dynamic-import round trip per attempt
// and the first diagram appeared seconds late (operator 2026-09-04).
let mermaidPromise: Promise<typeof import("mermaid")> | null = null;
const loadMermaid = () => (mermaidPromise ??= import("mermaid"));

// Mermaid appends its "Syntax error in text" bomb graphic to <body> on every
// failed parse — one per attempt, including salvage retries (`d<id>`,
// `d<id>-salvageN`). Remove all of them for a given render id, plus any
// orphaned error element still floating under <body>.
function purgeMermaidErrors(id: string) {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll(
      `#${id}, #d${id}, [id^="d${id}-salvage"], body > div[aria-roledescription="error"], body > .mermaid[aria-roledescription="error"]`,
    )
    .forEach((n) => n.remove());
}

// Salvage pass: models often stream a valid diagram followed by a broken tail
// line (e.g. a `class a,b,c` with no className). If the full source fails,
// drop trailing lines until it parses — a slightly-less-decorated diagram beats
// "couldn't be rendered" for an otherwise-good flowchart.
async function renderMermaid(
  id: string,
  code: string,
  dark: boolean,
): Promise<string> {
  // Import + render can BOTH hang/fail (a 404 on the mermaid chunk after a
  // dev build swap left cards on "rendering diagram…" forever, audit
  // 2026-10-09 RCA). Bound the whole thing; failure → softfail path.
  const mermaid = (await Promise.race([
    loadMermaid(),
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("mermaid import/render timeout")), 10_000),
    ),
  ])).default;
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
  try {
    // Mermaid renders model TEXT into its own SVG — the <style> block is
    // mermaid's theme, not model-supplied markup, so it must NOT go through
    // the style-stripping svg-fence sanitizer (that stripped the theme and
    // the diagram rendered as black boxes, 2026-10-11 regression).
    return (await mermaid.render(id, code)).svg;
  } catch (err) {
    const lines = code.split("\n");
    // Only worth retrying when there's something to drop.
    // Salvage: drop trailing lines one at a time until the diagram parses
    // (models often stream a valid chart + a broken tail like a classless
    // `class a,b,c` line). Cap at 5 drops so we don't eat the diagram.
    let trimmed = code;
    for (let drop = 0; drop < 5; drop++) {
      const lines = trimmed.split("\n");
      if (lines.length <= 3) break;
      trimmed = lines.slice(0, -1).join("\n").trimEnd();
      if (!trimmed) break;
      try {
        return (await mermaid.render(`${id}-salvage${drop}`, trimmed)).svg;
      } catch {
        /* try one line shorter */
      }
    }
    console.warn("[mermaid] render failed:", (err as Error)?.message?.slice(0, 200), "\ncode:", code.slice(0, 400));
    throw err;
  }
}

function MermaidBlock({ code, streaming }: { code: string; streaming: boolean }) {
  const rawId = useId();
  const id = `mmd-${rawId.replace(/[^a-zA-Z0-9-]/g, "")}`;
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [svg, setSvg] = useState<string | null>(null);
  const [softFailed, setSoftFailed] = useState(false);
  const [mode, setMode] = useState<"diagram" | "code">("diagram");
  const prevCodeRef = useRef<string>("");
  // Keep the last good SVG across a failed re-render — mid-stream a broken
  // partial must never blank an already-drawn diagram.
  const lastGoodRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevCodeRef.current;
    const isExtension = code.startsWith(prev) && code.length >= prev.length;
    if (prev && !isExtension && !streaming) {
      setSvg(null);
      lastGoodRef.current = null;
    }
    prevCodeRef.current = code;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const render = async () => {
      // Empty/whitespace fence (audit 2026-10-09): mermaid.render can RESOLVE
      // with an empty svg string for empty input — falsy, so the card sat on
      // "rendering diagram…" forever. Treat empty input as an immediate
      // soft-fail (view-source fallback) once settled.
      if (!code.trim()) {
        if (!streaming) setSoftFailed(true);
        return;
      }
      try {
        const out = await renderMermaid(id, code, dark);
        if (active) {
          if (out && out.trim()) {
            setSvg(out);
            lastGoodRef.current = out;
            setSoftFailed(false);
          } else if (!streaming && !lastGoodRef.current) {
            setSoftFailed(true);
          }
        }
      } catch {
        // On failure keep showing the last good render (streaming partials
        // fail constantly). Only when NOTHING ever rendered do we soft-fail.
        if (active && !lastGoodRef.current && !streaming) setSoftFailed(true);
      } finally {
        // Purge mermaid's error bombs after EVERY attempt, success included:
        // a failed partial appends a "Syntax error in text" graphic to <body>,
        // and when a LATER attempt succeeds the catch path never runs — the
        // stale bomb stayed on screen forever (operator 2026-09-05).
        purgeMermaidErrors(id);
      }
    };
    timer = setTimeout(render, 250);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [code, dark, id, streaming]);

  const naturalDims = useMemo(() => {
    if (!svg) return null;
    const m = svg.match(/viewBox="([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"/);
    if (!m) return null;
    const w = parseFloat(m[3]);
    const h = parseFloat(m[4]);
    return h > 0 ? { w, h } : null;
  }, [svg]);

  // Drag-to-pan: wide/tall diagrams render at natural size inside a scroll
  // container; pointer-drag pans it (grab cursor). Overflow-y allows tall
  // diagrams to pan vertically too (operator 2026-09-04).
  const panRef = useRef<HTMLDivElement>(null);
  const panState = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const onPanDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = panRef.current;
    if (!el) return;
    panState.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
    el.setPointerCapture(e.pointerId);
  };
  const onPanMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = panRef.current;
    const s = panState.current;
    if (!el || !s) return;
    el.scrollLeft = s.l - (e.clientX - s.x);
    el.scrollTop = s.t - (e.clientY - s.y);
  };
  const onPanUp = () => {
    panState.current = null;
  };

  const renderBody = svg ? (
    <div
      ref={panRef}
      className="cb-mermaid-wide cb-mermaid-pan"
      onPointerDown={onPanDown}
      onPointerMove={onPanMove}
      onPointerUp={onPanUp}
      onPointerCancel={onPanUp}
      dangerouslySetInnerHTML={{
        __html: naturalDims
          ? svg.replace(
              /(<svg[^>]*?)\swidth="100%"/,
              `$1 style="width:${Math.round(naturalDims.w)}px !important;max-width:none !important;height:auto !important;margin:0 auto"`,
            )
          : svg,
      }}
    />
  ) : softFailed ? (
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

// Settled diff fences split into hunks (context runs of 6+ lines are hunk
// breaks, keeping 3 lines of padding on each side) so each hunk gets its own
// keep/discard review row. "Apply" copies the kept patch (added + context
// lines of kept hunks) to the clipboard — client-side only, no file writes.
function splitDiffHunks(lines: readonly DiffLine[]): DiffHunk[] {
  const hunks: DiffLine[][] = [];
  let cur: DiffLine[] = [];
  let contextRun = 0;
  for (const line of lines) {
    if (line.kind === "context") {
      contextRun++;
      if (contextRun === 6 && cur.some((l) => l.kind !== "context")) {
        // Close the hunk after 3 padding lines; the rest starts the next hunk.
        hunks.push(cur.slice(0, cur.length - 3));
        cur = cur.slice(-3);
      }
    } else {
      contextRun = 0;
    }
    cur.push(line);
  }
  if (cur.length > 0) hunks.push(cur);
  return hunks
    .filter((h) => h.some((l) => l.kind !== "context"))
    .map((h, i) => ({
      id: `hunk-${i + 1}`,
      range: `hunk ${i + 1}`,
      decision: "pending" as const,
      lines: h,
    }));
}

function SettledReviewableDiff({
  filename,
  hunks,
}: {
  filename: string;
  hunks: readonly DiffHunk[];
}) {
  const [decisions, setDecisions] = useState<Record<string, HunkDecision>>({});
  const merged = hunks.map((h) => ({ ...h, decision: decisions[h.id] ?? h.decision }));
  const apply = () => {
    const kept = merged
      .filter((h) => h.decision === "kept")
      .flatMap((h) =>
        h.lines
          .filter((l) => l.kind !== "removed")
          .map((l) => (l.kind === "added" ? `+${l.text}` : ` ${l.text}`)),
      )
      .join("\n");
    navigator.clipboard.writeText(kept).then(() => toast.success("Kept patch copied"));
  };
  return (
    <ReviewableDiff
      filename={filename}
      hunks={merged}
      onKeep={(id) => setDecisions((d) => ({ ...d, [id]: "kept" }))}
      onDiscard={(id) => setDecisions((d) => ({ ...d, [id]: "discarded" }))}
      onApply={apply}
    />
  );
}

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
