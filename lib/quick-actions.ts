export type QuickAction =
  | "explain"
  | "tests"
  | "run"
  | "flow-current"
  | "flow-optimal"
  | "audit";

export function buildQuickActionPrompt(action: QuickAction, code: string, lang: string): string {
  switch (action) {
    case "explain":
      return `Explain this ${lang} code in detail. What does it do? How does it work? What are the key concepts?

\`\`\`${lang}
${code}
\`\`\``;

    case "tests":
      return `Write comprehensive unit tests for this ${lang} code. Include edge cases and error handling tests.

\`\`\`${lang}
${code}
\`\`\``;

    case "run":
      return `Execute this ${lang} code and show me the output:

\`\`\`${lang}
${code}
\`\`\``;

    case "flow-current":
      return `Generate a precise flowchart for the CURRENT behavior of this ${lang} code.
Return:
1) a short explanation, and
2) a Mermaid flowchart in a fenced code block.

\`\`\`mermaid
flowchart TD
  A[Start] --> B[...]
\`\`\`

\`\`\`${lang}
${code}
\`\`\``;

    case "flow-optimal":
      return `Generate an OPTIMIZED flowchart for this ${lang} code.
Return:
1) bottlenecks in current flow,
2) the improved flow,
3) a Mermaid diagram for the improved flow,
4) concrete code-level optimization steps.

\`\`\`${lang}
${code}
\`\`\``;

    case "audit":
      return `Audit this ${lang} code for correctness, security, and maintainability.
Give findings ordered by severity with actionable fixes and a quick test plan.

\`\`\`${lang}
${code}
\`\`\``;

    default:
      return code;
  }
}
