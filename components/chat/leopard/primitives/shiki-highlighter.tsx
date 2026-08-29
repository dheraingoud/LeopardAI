"use client";

import { useEffect, useState } from "react";
import { createHighlighter, type Highlighter } from "shiki";

// Shared shiki singleton (dual-theme, light-dark driven by global CSS) plus the
// settled-only highlight hook. streaming-text.tsx re-bases on this.
const SHIKI_LANGS = [
  "plaintext", "javascript", "typescript", "tsx", "jsx", "json", "jsonc",
  "css", "html", "markdown", "mdx", "yaml", "python", "bash", "shell",
  "sh", "go", "rust", "cpp", "c", "csharp", "java", "kotlin", "ruby",
  "php", "sql", "diff", "graphql", "vue", "svelte", "xml", "toml", "ini",
  "dockerfile", "docker", "bat", "powershell", "makefile", "nginx", "regex",
];

let hlPromise: Promise<Highlighter> | null = null;
function getHighlighter(): Promise<Highlighter> {
  if (!hlPromise) {
    hlPromise = createHighlighter({
      themes: ["github-dark-default", "github-light-default"],
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

// Returns highlighted HTML once settled; null while streaming or before the
// highlighter warms — callers render plain code in the same container so
// settling is a color change, not a layout shift.
export function useShikiHtml(
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
