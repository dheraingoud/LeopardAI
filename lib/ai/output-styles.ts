// Φ-docs · output styles. Mirrors Claude Code's configurable voice, but for the
// web chat: a named style appends a directive to the system prompt that changes
// how Leopard responds — never what it knows. Pure + DI so it unit-tests offline.
//
// Built-ins map to Claude Code's documented behaviors:
//   - default     — no change (Leopard's baseline voice)
//   - proactive   — execute immediately, assume routine decisions, prefer action
//   - explanatory — lead with "Insight:" callouts explaining the reasoning
//   - learning    — collaborative; explain choices AND ask the user to write
//                   small pieces, flagged with TODO(human) markers
//   - concise     — shortest faithful answer; no preamble, no restating the ask
//
// Selection order (first defined wins): per-turn `style` arg > env default
// `LEOPARD_OUTPUT_STYLE` > none. Unknown names are ignored (fail-closed) so a bad
// value never degrades the prompt. Custom maps let a deploy layer add styles
// without code churn.

export type OutputStyleKey = "default" | "proactive" | "explanatory" | "learning" | "concise";

export const OUTPUT_STYLE_KEYS: readonly OutputStyleKey[] = [
  "default",
  "proactive",
  "explanatory",
  "learning",
  "concise",
];

export const OUTPUT_STYLE_DIRECTIVES: Readonly<Record<OutputStyleKey, string>> = {
  default: "",
  proactive: `OUTPUT-STYLE (proactive):
- Execute immediately. Make reasonable assumptions for routine decisions instead
  of pausing to ask.
- Prefer action over planning; only stop to confirm on irreversible, destructive,
  or high-blast-radius steps.`,
  explanatory: `OUTPUT-STYLE (explanatory):
- After completing each step of substantial work, add a short "Insight:" note
  explaining the why — the implementation choice, the trade-off, the pattern.
- Keep insights educational but tight; never pad an answer with fluff.`,
  learning: `OUTPUT-STYLE (learning):
- Work with the user rather than doing everything. Explain each implementation
  choice briefly, then hand the user small, strategic pieces to write.
- Flag the pieces the user should implement inline in code with "TODO(human):" —
  never write them yourself.
- Keep it a genuine back-and-forth, not a lecture.`,
  concise: `OUTPUT-STYLE (concise):
- Give the shortest answer that is still faithful and complete.
- No preamble, no restating the request, no closing pleasantries. Answer directly.`,
};

/** Environment default (fail-closed: any unknown/unset value → no style). */
export function defaultOutputStyle(env: Partial<NodeJS.ProcessEnv> = process.env): OutputStyleKey | undefined {
  const v = env.LEOPARD_OUTPUT_STYLE;
  if (!v) return undefined;
  const key = v.trim().toLowerCase() as OutputStyleKey;
  return OUTPUT_STYLE_KEYS.includes(key) && key !== "default" ? key : undefined;
}

/** Resolve the effective style, then return its prompt directive ("" when none). */
export function resolveOutputStyleDirective(input: {
  style?: string | null;
  env?: Partial<NodeJS.ProcessEnv>;
  directives?: Readonly<Record<string, string>>;
}): string {
  const { style, env = process.env, directives = OUTPUT_STYLE_DIRECTIVES } = input;
  const key = (style ?? "").trim().toLowerCase();
  // Per-turn style wins when it names a built-in or a key in the supplied custom
  // map. Otherwise fall back to the env default, then to the baseline ("default")
  // which resolves to "" unless a custom map overrides it.
  const effective =
    key && key !== "default" && (OUTPUT_STYLE_KEYS.includes(key as OutputStyleKey) || key in directives)
      ? key
      : defaultOutputStyle(env) ?? "default";
  return (directives as Record<string, string>)[effective] ?? "";
}

/** Append the directive to an existing system prompt (newline separated). */
export function applyStyleToPrompt(prompt: string, directive: string): string {
  if (!directive.trim()) return prompt;
  return `${prompt.trim()}\n\n${directive.trim()}`;
}

/** Sanitize a raw request value into a style key, or undefined if not a known key. */
export function sanitizeOutputStyle(value: unknown): OutputStyleKey | undefined {
  if (typeof value !== "string") return undefined;
  const k = value.trim().toLowerCase() as OutputStyleKey;
  return OUTPUT_STYLE_KEYS.includes(k) && k !== "default" ? k : undefined;
}