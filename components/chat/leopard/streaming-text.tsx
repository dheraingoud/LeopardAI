"use client";

// Leopard StreamingText — fork of the kit streaming/markdown renderer, merged
// with leopard's full pipeline: shiki dual-theme highlighting (settled blocks
// only), mermaid (live, debounced, natural-size), KaTeX math (settled only),
// DOMPurify'd svg fences, fence-aware block memoization, 48ms streaming
// throttle, amber tail + single caret. Owns NO scroll logic (messages.tsx).

import {
  memo,
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
import "katex/dist/katex.min.css";
import { Check, ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";
import { createHighlighter, type Highlighter } from "shiki";
import { useTheme } from "@/components/theme-provider";
import { cn, sanitizeText } from "@/lib/utils";
import DOMPurify from "dompurify";
import { MathBlock } from "./math-block";
import { TerminalBlock } from "./terminal-block";
import { CitationLink } from "./inline-citation";
import { BarChart, parseChartSpec } from "./chart";
import { DataTable, parseCsvTable } from "./data-table";
import { SpecSheet, parseSpecSheet } from "./spec-sheet";

function sanitizeSvg(code: string): string {
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(code, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "script", "style"],
  }).trim();
}

const SHIKI_LANGS = [
  "plaintext", "javascript", "typescript", "tsx", "jsx", "json", "jsonc",
  "css", "html", "markdown", "mdx", "yaml", "python", "bash", "shell",
  "sh", "go", "rust", "cpp", "c", "csharp", "java", "kotlin", "ruby",
  "php", "sql", "diff", "graphql", "vue", "svelte", "xml", "toml", "ini",
  "dockerfile", "docker", "bat", "powershell", "makefile", "nginx", "regex",
];
const SHIKI_THEMES = ["github-dark-default", "github-light-default"] as const;

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

function highlight(hl: Highlighter, lang: string, code: string): string | null {
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

export const StreamingText = memo(function StreamingText({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  const sanitized = sanitizeText(content).replace(/\s+height=["']auto["']/g, "");
  // Throttle re-parse to ~48ms commits while streaming — a full ReactMarkdown
  // pass per token is O(n²) and was the "UI trails the model" hot path.
  const [throttled, setThrottled] = useState(sanitized);
  const lastCommit = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sanitizedRef = useRef(sanitized);
  sanitizedRef.current = sanitized;
  useEffect(() => {
    if (!streaming) {
      if (pending.current) clearTimeout(pending.current);
      pending.current = null;
      setThrottled(sanitized);
      return;
    }
    const now = Date.now();
    const since = now - lastCommit.current;
    if (since >= 48) {
      lastCommit.current = now;
      setThrottled(sanitized);
    } else if (!pending.current) {
      pending.current = setTimeout(() => {
        lastCommit.current = Date.now();
        setThrottled(sanitizedRef.current);
        pending.current = null;
      }, 48 - since);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sanitized, streaming]);
  // Fence-aware block split: only the growing tail block re-parses per commit.
  const blocks = useMemo(() => splitMarkdownBlocks(throttled), [throttled]);
  return (
    <div className="markdown-body text-[15px] leading-[1.75] dark:text-[#dedede] light:text-[#262626]">
      {blocks.map((b, i) => (
        <MarkdownBlock
          key={i}
          content={b}
          streaming={!!streaming && i === blocks.length - 1}
        />
      ))}
      {streaming && <span aria-hidden className="leopard-stream-caret" />}
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
    }),
    [streaming],
  );
  return (
    <div
      className={
        streaming
          ? "animate-in fade-in duration-300 leopard-fresh-tail"
          : undefined
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={streaming ? [] : [rehypeKatex]}
        skipHtml={false}
        urlTransform={(u) => u}
        components={components}
      >
        {streaming ? content.replace(/\$\$([^$]+)\$\$/g, "$1") : content}
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

  if (lang === "mermaid" || lang === "diagram") {
    return <MermaidBlock code={text} streaming={streaming} />;
  }

  if (lang === "math" || lang === "latex" || lang === "tex") {
    return (
      <MathBlock
        label={lang}
        steps={[{ expression: <code>{text}</code> }]}
        visibleSteps={1}
      />
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
      if (table) return <DataTable header={table.header} rows={table.rows} />;
    } else {
      const spec = parseSpecSheet(text);
      if (spec) return <SpecSheet title={spec.title} fields={spec.fields} />;
    }
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
function MermaidBlock({ code, streaming }: { code: string; streaming: boolean }) {
  const rawId = useId();
  const id = `mmd-${rawId.replace(/[^a-zA-Z0-9-]/g, "")}`;
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [svg, setSvg] = useState<string | null>(null);
  const [softFailed, setSoftFailed] = useState(false);
  const [mode, setMode] = useState<"diagram" | "code">("diagram");
  const prevCodeRef = useRef<string>("");
  useEffect(() => {
    const prev = prevCodeRef.current;
    const isExtension = code.startsWith(prev) && code.length >= prev.length;
    if (prev && !isExtension && !streaming) {
      setSvg(null);
    }
    prevCodeRef.current = code;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const render = async () => {
      try {
        const mermaidMod = await import("mermaid");
        const mermaid = mermaidMod.default;
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
        if (typeof document !== "undefined") {
          for (const sel of [`#${id}`, `#d${id}`]) {
            document.querySelectorAll(sel).forEach((n) => n.remove());
          }
          document
            .querySelectorAll('.mermaid [aria-roledescription="error"], div[id^="dmmd-"]')
            .forEach((n) => n.remove());
        }
        if (active && !svg && !streaming) setSoftFailed(true);
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

  const renderBody = svg ? (
    <div
      className="cb-mermaid-wide"
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
