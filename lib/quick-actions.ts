export type QuickAction = "explain" | "tests" | "run";

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

    default:
      return code;
  }
}
