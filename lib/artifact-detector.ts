import type { Artifact } from "@/types";

const IMAGE_MARKDOWN_REGEX =
  /!\[[^\]]*\]\((https?:\/\/[^\s)]+|data:image\/[^)\s]+|blob:[^)\s]+)\)\s*<!--\s*img:(?:[a-f0-9-]{16,}|[A-Z0-9-]+)\s*-->/gi;
const VIDEO_LINK_REGEX = /\[(?:video output|watch video|view video)\]\((https?:\/\/[^)]+)\)/i;
const VIDEO_PLACEHOLDER_REGEX = /video output ready/i;

/**
 * Detect and extract artifacts from assistant message content.
 * Identifies: HTML docs, React/JSX/TSX components, SVG, CSV, Mermaid diagrams,
 * Markdown documents, and general code blocks.
 *
 * Only code blocks with >3 lines are considered for canvas preview.
 */
export function detectArtifacts(content: string): Artifact[] {
  const artifacts: Artifact[] = [];
  let counter = 0;

  // Match fenced code blocks: ```language\n...\n```
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = (match[1] || "text").toLowerCase();
    const code = match[2].trim();
    const lineCount = code.split("\n").length;
    counter++;

    // Skip tiny snippets — they don't need a canvas
    if (lineCount <= 3) continue;

    // Determine artifact type and title
    let type: Artifact["type"] = "code";
    let title = `Code Block ${counter}`;

    // HTML — explicit lang or content detection
    if (
      language === "html" ||
      code.includes("<!DOCTYPE") ||
      code.includes("<html")
    ) {
      type = "html";
      title = extractHtmlTitle(code) || `HTML Document ${counter}`;
    }
    // React — JSX/TSX or JS with React patterns
    else if (
      ["jsx", "tsx", "react"].includes(language) ||
      (["javascript", "js", "typescript", "ts"].includes(language) &&
        (code.includes("useState") ||
          code.includes("useEffect") ||
          code.includes("React") ||
          /<[A-Z]\w+/.test(code)))
    ) {
      type = "react";
      title = extractComponentName(code) || `React Component ${counter}`;
    }
    // SVG
    else if (language === "svg" || code.trimStart().startsWith("<svg")) {
      type = "svg";
      title = `SVG Graphic ${counter}`;
    }
    // CSV
    else if (language === "csv") {
      type = "csv";
      title = `Data Table ${counter}`;
    }
    // Mermaid
    else if (language === "mermaid") {
      type = "mermaid";
      title = extractMermaidTitle(code) || `Diagram ${counter}`;
    }
    // Markdown
    else if (["markdown", "md"].includes(language)) {
      type = "markdown";
      title = extractMarkdownTitle(code) || `Document ${counter}`;
    }
    // JSON
    else if (language === "json") {
      type = "json";
      title = "JSON Data";
      try {
        JSON.parse(code);
      } catch {
        // Non-parseable JSON-like snippets are still useful for inspection.
      }
    }
    // General code — use language for title
    else {
      title = `${language.charAt(0).toUpperCase() + language.slice(1)} Code`;
    }

    artifacts.push({
      id: `artifact-${counter}`,
      type,
      title,
      content: code,
      language,
    });
  }

  let imageMatch: RegExpExecArray | null;
  while ((imageMatch = IMAGE_MARKDOWN_REGEX.exec(content)) !== null) {
    counter++;
    artifacts.push({
      id: `artifact-${counter}`,
      type: "markdown",
      title: `Generated Image ${counter}`,
      content: `![Generated image](${imageMatch[1]})`,
      language: "markdown",
    });
  }

  if (!artifacts.some((artifact) => artifact.type === "json")) {
    const jsonCandidate = parseFirstJsonObject(content);
    if (jsonCandidate) {
      counter++;
      artifacts.push({
        id: `artifact-${counter}`,
        type: "json",
        title: "JSON Data",
        content: jsonCandidate,
        language: "json",
      });
    }
  }

  const videoLinkMatch = content.match(VIDEO_LINK_REGEX);
  if (videoLinkMatch || VIDEO_PLACEHOLDER_REGEX.test(content)) {
    counter++;
    const url = videoLinkMatch?.[1];
    const lines = [
      "## Video Output",
      "",
      url
        ? `[Video output](${url})`
        : "Video generation is still processing. Check the linked status endpoint for completion.",
    ];
    artifacts.push({
      id: `artifact-${counter}`,
      type: "markdown",
      title: "Video Output",
      content: lines.join("\n"),
      language: "markdown",
    });
  }

  return artifacts;
}

/* ─── Helper extractors ─── */

function extractHtmlTitle(html: string): string | null {
  const m = html.match(/<title>(.*?)<\/title>/i);
  return m ? m[1] : null;
}

function extractMermaidTitle(code: string): string | null {
  const first = code.split("\n")[0]?.trim();
  if (!first) return null;
  if (first.startsWith("graph") || first.startsWith("flowchart")) return "Flowchart";
  if (first.startsWith("sequenceDiagram")) return "Sequence Diagram";
  if (first.startsWith("classDiagram")) return "Class Diagram";
  if (first.startsWith("erDiagram")) return "ER Diagram";
  if (first.startsWith("gantt")) return "Gantt Chart";
  if (first.startsWith("pie")) return "Pie Chart";
  if (first.startsWith("stateDiagram")) return "State Diagram";
  if (first.startsWith("journey")) return "User Journey";
  if (first.startsWith("gitGraph")) return "Git Graph";
  return null;
}

function extractMarkdownTitle(md: string): string | null {
  for (const line of md.split("\n")) {
    if (line.startsWith("# ")) return line.slice(2).trim();
  }
  return null;
}

function extractComponentName(code: string): string | null {
  // export default function ComponentName
  const funcMatch = code.match(
    /(?:export\s+(?:default\s+)?)?function\s+([A-Z]\w+)/
  );
  if (funcMatch) return funcMatch[1];
  // const ComponentName =
  const constMatch = code.match(
    /(?:export\s+(?:default\s+)?)?const\s+([A-Z]\w+)\s*=/
  );
  if (constMatch) return constMatch[1];
  return null;
}

function parseFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1).trim();
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/**
 * Quick check for substantial previewable artifacts (>5 lines).
 */
export function hasDisplayableArtifacts(content: string): boolean {
  const artifacts = detectArtifacts(content);
  return artifacts.some((a) => a.content.split("\n").length > 5);
}
