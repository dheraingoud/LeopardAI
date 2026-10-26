"use client";

import { useMemo, type CSSProperties, type FC } from "react";
import { cn } from "@/lib/utils";
import { useShikiHtml } from "./primitives/shiki-highlighter";

// Forked from assistant-ui elements/shiki-highlighter.tsx. react-shiki is not
// a Leopard dependency, so this re-bases on Leopard's existing useShikiHtml
// singleton (primitives/shiki-highlighter.tsx) and keeps the same
// SyntaxHighlighter exported API: { code, language, theme, highlightLines,
// streaming, className, style, ... }. The `theme`, `engine`, and
// react-shiki-only options are accepted for API compatibility but the
// dual-theme github-dark/light pair from Leopard's singleton is always used.

/**
 * Props for the SyntaxHighlighter component.
 *
 * `language`, `theme`, `engine`, and the other react-shiki options are accepted
 * for source compatibility; only `code`, `language`, `highlightLines`,
 * `streaming`, `className`, and `style` are honored by the Leopard pipeline.
 */
export type SyntaxHighlighterProps = {
  code: string;
  language?: string | undefined;
  theme?: unknown;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  highlightLines?: readonly number[] | undefined;
  /** Skips tokenization and renders the plain code while `true`. */
  streaming?: boolean | undefined;
  // react-shiki compat — accepted, ignored.
  engine?: unknown;
  highlighter?: unknown;
  delay?: number | undefined;
  addDefaultStyles?: boolean | undefined;
  showLanguage?: boolean | undefined;
  transformers?: unknown;
  langAlias?: Record<string, string> | undefined;
  preloadLanguages?: unknown;
  customLanguages?: unknown;
  [key: string]: unknown;
};

const containerClassName =
  "leopard-shiki-base [&_pre]:border-border/50 [&_pre]:bg-muted/30! [&_.line]:px-0! [&_pre]:overflow-x-auto [&_pre]:rounded-t-none [&_pre]:rounded-b-xl [&_pre]:border [&_pre]:border-t-0 [&_pre]:p-3.5 [&_pre]:text-[13px] [&_pre]:leading-relaxed";

const PlainCode: FC<{ code: string }> = ({ code }) => (
  <pre>
    <code>{code}</code>
  </pre>
);

// Adds the `highlighted` class to the requested <span class="line"> rows of
// shiki's codeToHtml output (react-shiki did this via a transformer; Leopard's
// hook returns HTML so we post-process the line spans).
function applyHighlightLines(
  html: string,
  highlightLines: readonly number[],
): string {
  if (highlightLines.length === 0) return html;
  const wanted = new Set(highlightLines);
  let line = 0;
  return html.replace(/<span class="line"/g, (match) => {
    line += 1;
    return wanted.has(line)
      ? `<span class="line highlighted"`
      : match;
  });
}

/**
 * SyntaxHighlighter component.
 *
 * Skips tokenization while `streaming` and renders the plain code in the
 * same container, so streaming costs no Shiki work and settling is a color
 * change rather than a layout shift.
 */
export const SyntaxHighlighter: FC<SyntaxHighlighterProps> = ({
  code,
  language = "plaintext",
  className,
  style,
  streaming = false,
  highlightLines,
}) => {
  const trimmed = code.trim();
  const html = useShikiHtml(language, trimmed, streaming);
  const processed = useMemo(
    () =>
      html && highlightLines?.length
        ? applyHighlightLines(html, highlightLines)
        : html,
    [html, highlightLines],
  );

  return (
    <div
      className={cn(
        containerClassName,
        streaming && "leopard-shiki-streaming",
        className,
      )}
      style={style}
    >
      {streaming || !processed ? (
        <PlainCode code={trimmed} />
      ) : (
        <div dangerouslySetInnerHTML={{ __html: processed }} />
      )}
    </div>
  );
};

SyntaxHighlighter.displayName = "SyntaxHighlighter";
