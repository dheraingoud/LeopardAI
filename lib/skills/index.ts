// Internal skills registry — Anthropic-Skills-style blocks that inject
// instruction bodies into the system prompt when contextually relevant.
//
// Each skill is a markdown file under `lib/skills/*.md` with a YAML frontmatter
// block (`name`, `description`, `triggers`, `auto`). The registry reads the
// body lazily at server runtime so the .md stays the single source of truth.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface SkillMeta {
  name: string;
  description: string;
  triggers: string[];
  /** `true` = injected automatically when `triggers` match chat context. */
  auto: boolean;
}

export interface Skill extends SkillMeta {
  body: string;
}

const SKILLS_DIR = join(process.cwd(), "lib", "skills");

const MANIFEST: SkillMeta[] = [
  {
    name: "svg-gen",
    description:
      "Auto-triggers on SVG/vector output. Guarantees a self-contained, static, sanitizable, theme-aware SVG the client can inline and scale without error.",
    triggers: ["svg", "vector", "icon", "logo", "infographic", "visual"],
    auto: true,
  },
  {
    name: "mermaid-gen",
    description:
      "Auto-triggers on diagram output. Guarantees parser-safe single-fence mermaid — correct keyword headers, escaped labels, never a broken fence.",
    triggers: ["mermaid", "flowchart", "sequence diagram", "er diagram", "gantt", "pie chart"],
    auto: true,
  },
  {
    name: "code-gen",
    description:
      "Auto-triggers on code requests. Guarantees self-contained, runnable, language-tagged snippets the interactive client can execute without truncation or missing-API failures.",
    triggers: ["code", "implement", "function", "component", "script", "bug"],
    auto: true,
  },
  {
    name: "response-customization",
    description:
      "Auto-triggers on verbosity intent. Guarantees the response is tuned to the user's requested depth (concise / detailed) before any content is written.",
    triggers: ["concise", "tl;dr", "detailed", "short answer", "in depth", "verbose", "brief"],
    auto: true,
  },
  {
    name: "diagram-clarity",
    description:
      "Auto-triggers when the response contains a diagram. Guarantees well-formed single-fence mermaid so the client never surfaces a syntax error.",
    triggers: [
      "```mermaid",
      "diagram",
      "flowchart",
      "sequence diagram",
      "class diagram",
      "erDiagram",
      "gantt",
    ],
    auto: true,
  },
  {
    name: "math-typeset",
    description:
      "Auto-triggers when the response contains math. Guarantees KaTeX-compatible delimiters so equations typeset immediately, never as raw $ prose.",
    triggers: ["∫", "∑", "$$", "\\frac", "equation", "integral", "derivative", "math", "formula", "solve", "quadratic", "sqrt", "algebra", "calculus", "trigonometr", "polynomial"],
    auto: true,
  },
  {
    name: "mobile-format",
    description:
      "Auto-triggers when reading on a narrow viewport is likely. Prefers short paragraphs, bullets, and tables over dense prose.",
    triggers: [],
    auto: true,
  },
  {
    name: "code-review",
    description:
      "Slash-trigger. Reviews code adversarially with a prioritized, actionable findings list.",
    triggers: ["/review", "review this", "audit this code", "code review"],
    auto: true,
  },
  {
    name: "explain-sql",
    description:
      "Slash-trigger. Explains a SQL query step by step, including index analysis.",
    triggers: ["/explain", "explain this query", "explain sql"],
    auto: true,
  },
  {
    name: "debug-mode",
    description:
      "Slash-trigger. Debugs with a root-cause focus, never symptoms-first.",
    triggers: ["/debug", "debug this"],
    auto: true,
  },
  {
    name: "optimize",
    description:
      "Slash-trigger. Optimizes perf with a measure-before-decide rule and explicit tradeoffs.",
    triggers: ["/optimize", "optimize this", "make this faster"],
    auto: true,
  },
];

/** Read one skill's markdown body from disk. */
function loadBody(name: string): string | null {
  try {
    return readFileSync(join(SKILLS_DIR, `${name}.md`), "utf8");
  } catch {
    return null;
  }
}

/**
 * All registered skills with their instruction bodies loaded. Skills without a
 * matching `.md` on disk are skipped (registry metadata alone is inert).
 */
export function listSkills(): Skill[] {
  const skills: Skill[] = [];
  for (const meta of MANIFEST) {
    const body = loadBody(meta.name);
    if (body) skills.push({ ...meta, body });
  }
  return skills;
}

/**
 * Skills whose triggers appear in the given input, at most one per name.
 * Used to inject `auto` skills into the system prompt based on recent chat
 * context. Cheap substring match — no NLP, by design.
 */
export function getRelevantSkills(input: string): Skill[] {
  const haystack = input.toLowerCase();
  return listSkills().filter(
    (s) =>
      s.auto &&
      s.triggers.some((t) => haystack.includes(t.toLowerCase())),
  );
}

/** The full instruction block for a set of skills, or empty string if none. */
export function renderSkillBlocks(skills: Skill[]): string {
  if (skills.length === 0) return "";
  const blocks = skills
    .map((s) => `## ${s.name}\n${s.body.trim()}`)
    .join("\n\n---\n\n");
  return `\n\n## Instructions\n${blocks}`;
}