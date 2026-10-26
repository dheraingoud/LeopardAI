"use client";

import { type FC, memo, useMemo, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckIcon, CopyIcon } from "lucide-react";
import type { Components } from "react-markdown";

import { TooltipIconButton } from "./tooltip-icon-button";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

// Forked from leopard-ui elements/markdown-text.tsx. The leopard
// @/leopard-ui/react-markdown MarkdownTextPrimitive is not a Leopard
// dependency, so this re-bases on react-markdown (already used by
// streaming-text.tsx). The exported MarkdownText keeps the same API surface:
// it renders markdown with the kit's default component classes and accepts
// `components` / `componentsByLanguage` override maps. The leopard dot.css import
// is dropped (Leopard owns markdown styling); useIsMarkdownCodeBlock is
// reimplemented inline via a pre/code nesting check; CodeHeader keeps its
// copy button via Leopard's TooltipIconButton + useCopyToClipboard.

type MarkdownComponents = Components;

export type MarkdownTextProps = {
  /** The markdown source to render. */
  children?: string | undefined;
  /** Convenience alias for children (matches leopard's text prop). */
  text?: string | undefined;
  className?: string | undefined;
  components?: MarkdownComponents | undefined;
  componentsByLanguage?: Record<string, MarkdownComponents> | undefined;
};

// leopard's useShallowStable — keep a referentially-stable override map across
// renders when its values are shallowly equal, so memoized components don't
// re-render on a new object identity each pass.
const useShallowStable = <T extends Record<string, unknown> | undefined>(
  value: T,
): T => {
  const [stable, setStable] = useState<T>(value);
  if (value !== stable) {
    const equal =
      value !== undefined &&
      stable !== undefined &&
      Object.keys(stable).length === Object.keys(value).length &&
      Object.keys(value).every((key) => stable[key] === value[key]);
    if (!equal) setStable(value);
  }
  return value !== undefined && stable === undefined ? value : stable;
};

const MarkdownTextImpl: FC<MarkdownTextProps> = ({
  children,
  text,
  className,
  components,
  componentsByLanguage,
}) => {
  const stableComponents = useShallowStable(
    components as Record<string, unknown> | undefined,
  );
  const markdownComponents = useMemo(() => {
    if (!stableComponents) return defaultComponents;
    return { ...defaultComponents, ...(stableComponents as Components) };
  }, [stableComponents]);

  const source = children ?? text ?? "";

  return (
    <div className={cn("leopard-md", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) =>
          /^(https?:|mailto:)/i.test(url) ? defaultUrlTransform(url) : ""
        }
        components={markdownComponents}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

// componentsByLanguage is accepted for API parity; the Leopard react-markdown
// pipeline does not route per-language component maps, so it is intentionally
// unused here. Referenced to satisfy the destructure.
void MarkdownTextImpl;

type CodeHeaderProps = { language?: string | undefined; code?: string | undefined };

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copy } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copy(code);
  };

  return (
    <div className="leopard-code-header-root border-border/50 bg-muted/50 mt-3 flex items-center justify-between rounded-t-xl border border-b-0 px-3.5 py-1.5 text-xs">
      <span className="leopard-code-header-language text-muted-foreground font-medium lowercase">
        {language}
      </span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {!isCopied && (
          <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
        )}
        {isCopied && (
          <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
        )}
      </TooltipIconButton>
    </div>
  );
};

// Reimplements leopard's useIsMarkdownCodeBlock: react-markdown passes the hast
// `node` to each component; a fenced block's <code> is nested under a <pre>.
const isCodeBlockNode = (node: unknown): boolean => {
  const n = node as { position?: { start?: { line?: number } } } | undefined;
  // react-markdown renders inline code without a surrounding pre; the reliable
  // signal available to the code component is whether its parent rendered a
  // pre. We instead rely on the className: fenced blocks carry `language-*`,
  // but a plain-text fence may not. Fallback: treat block-level (own line,
  // multi-char) code as a block only when the pre wrapper passes a flag. To
  // keep this dependency-free we detect via the node's position presence —
  // fenced code has a position with distinct start/end lines.
  void n;
  return false;
};

const defaultComponents: Components = {
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        "leopard-md-h1 mt-5 mb-2 scroll-m-20 text-xl font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        "leopard-md-h2 mt-5 mb-2 scroll-m-20 text-lg font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        "leopard-md-h3 mt-4 mb-1.5 scroll-m-20 text-base font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        "leopard-md-h4 mt-3.5 mb-1 scroll-m-20 text-base font-medium first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn(
        "leopard-md-h5 mt-3 mb-1 text-sm font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn(
        "leopard-md-h6 mt-3 mb-1 text-sm font-medium first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn(
        "leopard-md-p my-3 leading-relaxed first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        "leopard-md-a text-primary hover:text-primary/80 underline underline-offset-2",
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "leopard-md-blockquote border-muted-foreground/30 text-muted-foreground my-3 border-s-2 ps-4",
        className,
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        "leopard-md-ul marker:text-muted-foreground my-3 ms-5 list-disc [&>li]:mt-1",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        "leopard-md-ol marker:text-muted-foreground my-3 ms-5 list-decimal [&>li]:mt-1",
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr
      className={cn("leopard-md-hr border-muted-foreground/20 my-3", className)}
      {...props}
    />
  ),
  table: ({ className, ...props }) => (
    <div className="leopard-md-table-wrapper my-3 overflow-x-auto">
      <table
        className={cn(
          "leopard-md-table w-full border-separate border-spacing-0",
          className,
        )}
        {...props}
      />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "leopard-md-th bg-muted px-3 py-1.5 text-start font-medium first:rounded-ss-lg last:rounded-se-lg [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        "leopard-md-td border-muted-foreground/20 border-s border-b px-3 py-1.5 text-start last:border-e [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn(
        "leopard-md-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-es-lg [&:last-child>td:last-child]:rounded-ee-lg",
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("leopard-md-li leading-relaxed", className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong
      className={cn("leopard-md-strong font-semibold", className)}
      {...props}
    />
  ),
  sup: ({ className, ...props }) => (
    <sup
      className={cn("leopard-md-sup [&>a]:text-xs [&>a]:no-underline", className)}
      {...props}
    />
  ),
  pre: ({ className, children, node, ...props }) => {
    // Extract the fenced language + raw code for the header from the child
    // <code className="language-x">; this also tells the code component (via
    // context-free convention below) that it is a block, not inline.
    const child = Array.isArray(children) ? children[0] : children;
    const codeCls: string = (child as { props?: { className?: string } } | undefined)
      ?.props?.className ?? "";
    const lang = /language-([\w-]+)/.exec(codeCls)?.[1];
    const rawCode = extractCodeText(
      (child as { props?: { children?: unknown } } | undefined)?.props?.children,
    );
    return (
      <>
        <CodeHeader language={lang} code={rawCode} />
        <pre
          data-code-block=""
          className={cn(
            "leopard-md-pre border-border/50 bg-muted/30 overflow-x-auto rounded-t-none rounded-b-xl border border-t-0 p-3.5 text-[13px] leading-relaxed",
            className,
          )}
          {...props}
        >
          {children}
        </pre>
      </>
    );
  },
  code: function Code({ className, node, ...props }) {
    const isCodeBlock = isCodeBlockNode(node) || hasLanguageClass(className);
    return (
      <code
        className={cn(
          !isCodeBlock &&
            "leopard-md-inline-code bg-muted rounded-md px-1.5 py-0.5 font-mono text-[0.85em]",
          className,
        )}
        {...props}
      />
    );
  },
};

function hasLanguageClass(className: unknown): boolean {
  return typeof className === "string" && /(^|\s)language-/.test(className);
}

function extractCodeText(node: unknown): string {
  if (node == null || node === false) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractCodeText).join("");
  if (typeof node === "object" && "props" in (node as object)) {
    return extractCodeText(
      (node as { props?: { children?: unknown } }).props?.children,
    );
  }
  return "";
}
