const CHARS_PER_TOKEN = 4;
const CHARS_PER_TOKEN_CJK = 2.5;

const CJK_RANGES =
  /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g;

function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjkMatches = text.match(CJK_RANGES);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkCount = text.length - cjkCount;
  return Math.ceil(nonCjkCount / CHARS_PER_TOKEN + cjkCount / CHARS_PER_TOKEN_CJK);
}

export interface FileChunk {
  index: number;
  content: string;
  startLine: number;
  endLine: number;
  tokenEstimate: number;
}

export interface ChunkedFile {
  filename: string;
  language: string;
  totalLines: number;
  chunks: FileChunk[];
  outline?: string;
}

// ─── Language detection ───────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  py: "python",
  java: "java",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  html: "html",
  htm: "html",
  xml: "xml",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  ps1: "shell",
  toml: "toml",
  tf: "hcl",
};

function detectLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot !== -1 ? lower.slice(dot + 1) : "";
  return EXT_TO_LANG[ext] ?? "text";
}

function getDeclarationLine(line: string, lang: string): string | null {
  const trimmed = line.trimLeft();

  switch (lang) {
    case "typescript":
    case "javascript": {
      // decorators can appear before exports — allow them through
      if (trimmed.startsWith("export ")) {
        const rest = trimmed.slice(7).trimStart();
        if (
          rest.startsWith("function ") ||
          rest.startsWith("async function ") ||
          rest.startsWith("const ") ||
          rest.startsWith("let ") ||
          rest.startsWith("var ") ||
          rest.startsWith("class ") ||
          rest.startsWith("interface ") ||
          rest.startsWith("type ") ||
          rest.startsWith("enum ")
        )
          return line;
      }
      if (trimmed.startsWith("function ") || trimmed.startsWith("async function ")) return line;
      if (trimmed.startsWith("class ") || trimmed.startsWith("interface ")) return line;
      if (
        (trimmed.startsWith("const ") || trimmed.startsWith("let ") || trimmed.startsWith("var ")) &&
        trimmed.includes("=") &&
        trimmed.includes("=>")
      )
        return line; // arrow function assignments
      // non-exported class / interface at module level
      if (trimmed.startsWith("declare ")) return line;
    }

    case "python": {
      const pyTrimmed = trimmed;
      if (pyTrimmed.startsWith("def ") || pyTrimmed.startsWith("async def ")) return line;
      if (pyTrimmed.startsWith("class ")) return line;
      if (pyTrimmed.startsWith("@")) return line; // decorator
      // at-indent decorators inside classes, track depth by indent
      break;
    }

    case "java":
    case "cpp":
    case "c":
    case "csharp": {
      if (trimmed.startsWith("public ") || trimmed.startsWith("private ") || trimmed.startsWith("protected ")) {
        const inner = trimmed.slice(trimmed.indexOf(" ") + 1).trimStart();
        if (inner.startsWith("class ") || inner.startsWith("interface ") || inner.startsWith("enum ")) return line;
        // method / constructor — only at top level (depth 0)
        if (inner.startsWith("void ") || inner.startsWith("static ") || inner.startsWith("<") || /^[A-Z]/.test(inner)) return line;
      }
      if (trimmed.startsWith("class ") || trimmed.startsWith("struct ") || trimmed.startsWith("interface ") || trimmed.startsWith("enum ")) return line;
      break;
    }

    case "go": {
      if (trimmed.startsWith("func ") && !trimmed.startsWith("func (")) return line;
      if (trimmed.startsWith("type ") || trimmed.startsWith("package ")) return line;
      break;
    }

    case "rust": {
      if (trimmed.startsWith("fn ") || trimmed.startsWith("async fn ") || trimmed.startsWith("pub fn ")) return line;
      if (trimmed.startsWith("struct ") || trimmed.startsWith("enum ") || trimmed.startsWith("trait ") || trimmed.startsWith("impl ")) return line;
      break;
    }

    case "ruby": {
      if (trimmed.startsWith("def ") || trimmed.startsWith("class ") || trimmed.startsWith("module ") || trimmed.startsWith("module_function ") || trimmed.startsWith("class_method ")) return line;
      break;
    }

    case "php": {
      if (trimmed.startsWith("function ") || trimmed.startsWith("class ") || trimmed.startsWith("interface ") || trimmed.startsWith("trait ") || trimmed.startsWith("const ")) return line;
      if (trimmed.startsWith("public ") || trimmed.startsWith("private ") || trimmed.startsWith("protected ")) return line;
      break;
    }
  }

  return null;
}

// ─── isTopLevelHeaderline ────────────────────────────────────────────────────
// Lines that belong to the header section (imports, module declarations, etc.)
function isTopLevelHeader(line: string, lang: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  switch (lang) {
    case "typescript":
    case "javascript": {
      if (trimmed.startsWith("import ") || trimmed.startsWith("export ") && !trimmed.startsWith("export default")) return true;
      if (trimmed.startsWith("require(")) return true;
      if (trimmed === '"use strict";') return true;
      if (trimmed.startsWith("/*") || trimmed.startsWith("//") || trimmed.startsWith("///")) return true;
      break;
    }
    case "python": {
      if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) return true;
      if (trimmed.startsWith("#") || trimmed.startsWith('"""') || trimmed.startsWith("'''")) return true;
      break;
    }
    case "java": {
      if (trimmed.startsWith("package ") || trimmed.startsWith("import ")) return true;
      if (trimmed.startsWith("//") || trimmed.startsWith("/*")) return true;
      break;
    }
    case "go": {
      if (trimmed.startsWith("package ") || trimmed.startsWith("import (")) return true;
      if (trimmed.startsWith("//") || trimmed.startsWith("/*")) return true;
      break;
    }
    case "rust": {
      if (trimmed.startsWith("use ") || trimmed.startsWith("mod ") || trimmed.startsWith("#[") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return true;
      break;
    }
    default: {
      if (trimmed.startsWith("#") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return true;
    }
  }
  return false;
}

// ─── Header lines for chunk 0 ─────────────────────────────────────────────────
// Collect the leading contiguous header block (imports, comments, etc.)
function collectHeaderLines(lines: string[], lang: string): number {
  let end = 0;
  while (end < lines.length && isTopLevelHeader(lines[end], lang)) end++;
  return end;
}

// ─── chunkFile ────────────────────────────────────────────────────────────────

export function chunkFile(
  content: string,
  filename: string,
  maxTokensPerChunk = 2000,
): ChunkedFile {
  const lang = detectLanguage(filename);
  const rawLines = content.split("\n");
  const totalLines = rawLines.length;

  if (totalLines === 0) {
    return { filename, language: lang, totalLines: 0, chunks: [] };
  }

  const headerEnd = collectHeaderLines(rawLines, lang);
  const bodyLines = rawLines.slice(headerEnd);
  const headerLines = rawLines.slice(0, headerEnd);

  const chunks: FileChunk[] = [];

  // Build body chunks — accumulate until maxTokensPerChunk exceeded
  function buildChunks(bodyStartIndex: number, startLineGlobal: number): void {
    let accumulated: string[] = [];
    let accumulatedTokens = 0;
    let globalStartLine = startLineGlobal;
    let lastDeclBoundary = -1; // index into accumulated when last decl was seen

    for (let i = bodyStartIndex; i < bodyLines.length; i++) {
      const line = bodyLines[i];
      const lineTokens = estimateTokens(line);

      if (accumulatedTokens + lineTokens > maxTokensPerChunk && accumulated.length > 0) {
        // Emit current chunk
        chunks.push({
          index: chunks.length,
          content: accumulated.join("\n"),
          startLine: globalStartLine + 1,
          endLine: globalStartLine + accumulated.length,
          tokenEstimate: accumulatedTokens,
        });
        // Reset, but carry over lines after last decl boundary to preserve context
        const carryLines = lastDeclBoundary >= 0
          ? accumulated.slice(lastDeclBoundary)
          : accumulated.length > 2 ? accumulated.slice(-2) : [];
        const carryTokens = estimateTokens(carryLines.join("\n"));
        accumulated = carryLines;
        accumulatedTokens = carryTokens;
        globalStartLine = lastDeclBoundary >= 0
          ? globalStartLine + lastDeclBoundary
          : globalStartLine + (accumulated.length > 2 ? accumulated.length - 2 : 0);
        lastDeclBoundary = -1;
      }

      accumulated.push(line);
      accumulatedTokens += lineTokens;

      const decl = getDeclarationLine(line, lang);
      if (decl !== null) {
        lastDeclBoundary = accumulated.length - 1;
      }

      // Soft boundary — next token-accumulation step will naturally split here
    }

    // Emit final chunk
    if (accumulated.length > 0) {
      chunks.push({
        index: chunks.length,
        content: accumulated.join("\n"),
        startLine: globalStartLine + 1,
        endLine: globalStartLine + accumulated.length,
        tokenEstimate: accumulatedTokens,
      });
    }
  }

  // Build body chunks and then prepend header as chunk 0
  buildChunks(0, headerEnd);

  // Take all built body chunks; bodyChunks will be re-indexed starting at 1
  const bodyChunks = chunks.splice(0);

  const headerTokenEstimate = estimateTokens(headerLines.join("\n"));
  const headerChunk: FileChunk = {
    index: 0,
    content: headerLines.join("\n"),
    startLine: 1,
    endLine: headerEnd,
    tokenEstimate: headerTokenEstimate,
  };

  // Re-index body chunks to start at 1
  const reindexed: FileChunk[] = bodyChunks.map((c, i) => ({
    ...c,
    index: i + 1,
  }));

  const allChunks = headerEnd > 0 ? [headerChunk, ...reindexed] : reindexed;

  // Safety: if any chunk somehow exceeds maxTokens (e.g. single giant line), split it further
  const safeChunks: FileChunk[] = [];
  for (const chunk of allChunks) {
    if (chunk.tokenEstimate <= maxTokensPerChunk) {
      safeChunks.push(chunk);
    } else {
      // Split by lines — keep adding lines until at token limit, then flush
      let buf: string[] = [];
      let bufTokens = 0;
      for (const line of chunk.content.split("\n")) {
        const lt = estimateTokens(line);
        if (bufTokens + lt > maxTokensPerChunk && buf.length > 0) {
          safeChunks.push({
            index: safeChunks.length,
            content: buf.join("\n"),
            startLine: chunk.startLine,
            endLine: chunk.startLine + buf.length - 1,
            tokenEstimate: bufTokens,
          });
          buf = [line];
          bufTokens = lt;
          chunk.startLine += buf.length;
        } else {
          buf.push(line);
          bufTokens += lt;
        }
      }
      if (buf.length > 0) {
        safeChunks.push({
          index: safeChunks.length,
          content: buf.join("\n"),
          startLine: chunk.startLine,
          endLine: chunk.startLine + buf.length - 1,
          tokenEstimate: bufTokens,
        });
      }
    }
  }

  return {
    filename,
    language: lang,
    totalLines,
    chunks: safeChunks,
  };
}

// ─── extractOutline ───────────────────────────────────────────────────────────

export function extractOutline(content: string, language: string): string {
  const lines = content.split("\n");
  const decls: string[] = [];

  switch (language) {
    case "typescript":
    case "javascript": {
      for (const raw of lines) {
        const trimmed = raw.trim();
        let extracted: string | null = null;

        if (trimmed.startsWith("export default function ") || trimmed.startsWith("export default async function ")) {
          const after = trimmed.replace("export default ", "");
          const paren = after.indexOf("(");
          extracted = paren !== -1 ? after.slice(0, paren + after.slice(paren).indexOf(")")) + ")" : after;
        } else if (trimmed.startsWith("export default class ")) {
          extracted = trimmed.match(/^export default class \S+/)?.[0] ?? trimmed;
        } else if (trimmed.startsWith("export default ")) {
          extracted = trimmed.replace("export default ", "").split(/[=\[{]/)[0].trim() + " …";
        } else if (trimmed.startsWith("export function ") || trimmed.startsWith("export async function ")) {
          const after = trimmed.slice(15);
          const paren = after.indexOf("(");
          extracted = "function " + (paren !== -1 ? after.slice(0, paren + 1 + after.slice(paren + 1).indexOf(")")) : after);
        } else if (trimmed.startsWith("export const ") || trimmed.startsWith("export let ") || trimmed.startsWith("export var ")) {
          extracted = trimmed.match(/^export (?:const|let|var) \w+/)?.[0] ?? trimmed;
        } else if (trimmed.startsWith("export class ")) {
          extracted = trimmed.match(/^export class \S+/)?.[0] ?? trimmed;
        } else if (trimmed.startsWith("export interface ")) {
          extracted = trimmed.match(/^export interface \S+/)?.[0] ?? trimmed;
        } else if (trimmed.startsWith("export type ")) {
          extracted = trimmed.match(/^export type \S+/)?.[0] ?? trimmed;
        } else if (trimmed.startsWith("export {")) {
          extracted = trimmed;
        } else if (trimmed.startsWith("declare ")) {
          extracted = trimmed;
        } else if (
          /^function \w+/.test(trimmed) ||
          /^async function \w+/.test(trimmed)
        ) {
          const m = trimmed.match(/^(async )?function \w+\([^)]*\)/);
          extracted = m?.[0] ?? trimmed.slice(0, trimmed.indexOf("{")).trimEnd();
        } else if (/^class \w+/.test(trimmed)) {
          extracted = trimmed.match(/^class \S+/)?.[0] ?? trimmed;
        } else if (/^interface \w+/.test(trimmed)) {
          extracted = trimmed.match(/^interface \S+/)?.[0] ?? trimmed;
        } else if (/^type \w+/.test(trimmed)) {
          extracted = trimmed.match(/^type \S+/)?.[0] ?? trimmed;
        }

        if (extracted) decls.push(extracted);
      }
      break;
    }

    case "python": {
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        // decorators
        if (trimmed.startsWith("@")) {
          decls.push(trimmed);
          continue;
        }
        const m = trimmed.match(/^(async )?def (\w+)/);
        if (m) {
          const isAsync = m[1] ? "async " : "";
          // collect args
          let rest = trimmed.slice(m[0].length).trim();
          if (rest.startsWith("(")) {
            const close = findMatchingParen(rest);
            if (close !== -1) rest = rest.slice(0, close + 1);
          }
          decls.push(`${isAsync}def ${m[2]}${rest}`);
          continue;
        }
        if (trimmed.startsWith("class ")) {
          const mc = trimmed.match(/^class (\w+)/);
          if (mc) decls.push(`class ${mc[1]}`);
        }
      }
      break;
    }

    case "java":
    case "csharp": {
      for (const raw of lines) {
        const trimmed = raw.trim();

        // package / namespace declarations (line-level)
        if (trimmed.startsWith("package ") || trimmed.startsWith("namespace ")) {
          decls.push(trimmed.split("{")[0].trim());
        }

        const m =
          trimmed.match(/^(public |private |protected )?(static )?(class|interface|enum|struct) (\w+)/) ??
          trimmed.match(/^(public |private |protected )?(async )?[\w<>\[\]]+ \w+\([^)]*\)/);
        if (m) decls.push(m[0].split("{")[0].trim().split(/\s*,\s*/)[0]);
      }
      break;
    }

    case "cpp":
    case "c": {
      for (const raw of lines) {
        const trimmed = raw.trim();
        // preprocessor lines are their own visual markers
        if (trimmed.startsWith("#include") || trimmed.startsWith("#define") || trimmed.startsWith("#pragma")) {
          decls.push(trimmed.split("\n")[0].trim());
          continue;
        }
        if (/^(class|struct|enum|namespace) \w+/.test(trimmed)) {
          decls.push(trimmed.match(/^(class|struct|enum|namespace) \w+/)?.[0] ?? trimmed);
        }
        if (/^\w+[\s*&]+\w+\([^)]*\)\s*(const)?\s*(override)?\s*(noexcept)?\s*\{/.test(trimmed)) {
          decls.push(trimmed.split("{")[0].trim());
        }
      }
      break;
    }

    case "go": {
      for (const raw of lines) {
        const trimmed = raw.trim();
        if (/^package \w+/.test(trimmed)) { decls.push(trimmed); continue; }
        // top-level func (not method on type)
        if (/^func \w+\(/.test(trimmed) && !/^func \w+\([^)]+\)/.test(trimmed.substring(4))) {
          decls.push(trimmed.split("{")[0].trim());
        }
        if (/^type \w+/.test(trimmed)) { decls.push(trimmed.split("{")[0].trim()); }
      }
      break;
    }

    case "rust": {
      for (const raw of lines) {
        const trimmed = raw.trim();
        if (/^(pub )?fn \w+/.test(trimmed)) { decls.push(trimmed.split("{")[0].trim()); continue; }
        if (/^(pub )?(struct|enum|trait|impl|mod|use) \w+/.test(trimmed)) { decls.push(trimmed.split("{")[0].trim()); }
      }
      break;
    }

    case "css":
    case "scss":
    case "less": {
      for (const raw of lines) {
        const trimmed = raw.trim();
        // CSS rule selectors — lines ending in { are selector lines
        if (trimmed.endsWith("{") && !trimmed.startsWith("@")) {
          decls.push(trimmed.slice(0, -1).trim());
        }
        if (trimmed.startsWith("@")) {
          decls.push(trimmed.split("{")[0].trim());
        }
      }
      break;
    }

    case "json": {
      try {
        const obj = JSON.parse(content);
        if (typeof obj === "object" && obj !== null) {
          decls.push(...Object.keys(obj));
        }
      } catch {
        // malformed JSON — fall through
      }
      break;
    }

    case "yaml": {
      for (const raw of lines) {
        const trimmed = raw.trim();
        if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("---") && !trimmed.startsWith("...")) {
          const colon = trimmed.indexOf(":");
          if (colon !== -1) {
            const key = trimmed.slice(0, colon).trim();
            // Only top-level keys (no leading space)
            if (raw.startsWith(" ") || raw.length === trimmed.length) continue;
            decls.push(key);
          } else if (/^-\s*\w/.test(trimmed)) {
            // list item
            decls.push(trimmed.replace(/^-\s*/, ""));
          }
        }
      }
      break;
    }

    default: {
      // generic fallback — class / function declarations via regex
      for (const raw of lines) {
        const trimmed = raw.trim();
        const m = trimmed.match(/^(export |public |private |static )?(class|function|interface|type|struct|enum)\s+\w+/);
        if (m) decls.push(m[0]);
      }
    }
  }

  // Fallback: if nothing extracted, use first 30 non-empty lines
  if (decls.length === 0) {
    const first30 = lines.filter((l) => l.trim()).slice(0, 30);
    if (first30.length === 0) return "<!-- empty file -->";
    const preview = first30.join(" | ").slice(0, 200);
    return (preview.length < first30.join(" | ").length ? preview + "…" : preview);
  }

  return decls.join("\n");
}

function findMatchingParen(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ─── selectRelevantChunks ─────────────────────────────────────────────────────

export function selectRelevantChunks(
  chunks: FileChunk[],
  query: string,
  budget: number,
): FileChunk[] {
  if (chunks.length === 0) return [];

  // Tokenize query into symbol words for matching
  const querySymbols = query.match(/[`'"]?([\w$][\w$]*)[`'"]?/g)?.map((s) => s.replace(/[`'"]/g, "").toLowerCase()) ?? [];

  type Scored = { chunk: FileChunk; score: number };
  const scored: Scored[] = chunks.map((chunk, i) => {
    const contentLower = chunk.content.toLowerCase();
    let score = 0;

    // Count keyword matches
    for (const sym of querySymbols) {
      const regex = new RegExp(`\\b${sym.replace(/\$/g, "\\$")}\\b`, "gi");
      const matches = contentLower.match(regex);
      if (matches) {
        score += matches.length;
        // Exact symbol name match is worth significantly more
        if (contentLower.includes(sym)) score += 5;
      }
    }

    // Chunk 0 has priority boost (file header / imports)
    if (i === 0) score += 0.5;

    return { chunk, score };
  });

  // Sort: highest score first, tiebreak by index (preserve natural order)
  scored.sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index);

  const selected: FileChunk[] = [];
  let usedTokens = 0;

  for (const { chunk } of scored) {
    if (usedTokens + chunk.tokenEstimate > budget) continue;
    selected.push(chunk);
    usedTokens += chunk.tokenEstimate;
  }

  // If chunk 0 wasn't selected by scoring (score too low), prepend it if budget allows
  const hasChunk0 = selected.some((c) => c.index === 0);
  if (!hasChunk0 && chunks[0].tokenEstimate <= budget - usedTokens) {
    selected.unshift(chunks[0]);
  }

  // Re-sort selected by original index to maintain file order
  selected.sort((a, b) => a.index - b.index);

  return selected;
}