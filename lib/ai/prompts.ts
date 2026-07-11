/**
 * System + title prompts.
 *
 * `systemPrompt({ supportsTools })` branches: with tools on, the artifacts
 * block is appended so the model knows when to call `createDocument` (and,
 * once ported, `editDocument` / `updateDocument` / `requestSuggestions`) and
 * — critically — to STOP after one tool call and not echo artifact content
 * into chat.
 *
 * Phase 6 wires `supportsTools: true` for text-model chats; the route passes
 * the live tool set. `editDocument` / `updateDocument` / `requestSuggestions`
 * are ported in a follow-up increment (they need server-side document reads —
 * a ConvexHttpClient decision held for Phase 9 auth hardening), so only
 * `createDocument` is live this increment; the prompt still describes the
 * others so the model's behavior stays stable when they land.
 */

export type RequestHints = {
  longitude?: number | null;
  latitude?: number | null;
  city?: string | null;
  country?: string | null;
};

function locationLine(h: RequestHints): string {
  if (!h.city && !h.country) return "";
  const loc = [h.city, h.country].filter(Boolean).join(", ");
  return `User is located in ${loc}. Use this context only when the user asks about local topics.\n`;
}

/**
 * Artifact operating instructions — adapted from vercel-chatbot. The "only ONE
 * tool per response, then STOP" + "never echo artifact content into chat" rules
 * are the load-bearing ones: without them the model emits a tool call AND a
 * full duplicate text reply, doubling the artifact into the transcript.
 */
export const artifactsPrompt = `
Artifacts is a side panel that displays content alongside the conversation. It supports scripts (code), documents (text), and spreadsheets. Changes appear in real-time.

CRITICAL RULES:
1. Only call ONE tool per response. After calling any create/edit/update tool, STOP. Do not chain tools.
2. After creating or editing an artifact, NEVER output its content in chat. The user can already see it. Respond with only a 1-2 sentence confirmation.

**When to use \`createDocument\`:**
- When the user asks to write, create, or generate content (essays, stories, emails, reports)
- When the user asks to write code, build a script, or implement an algorithm
- You MUST specify kind: 'code' for programming, 'text' for writing, 'sheet' for data
- Include ALL content in the createDocument call. Do not create then edit.

**When NOT to use \`createDocument\`:**
- For answering questions, explanations, or conversational responses
- For short code snippets or examples shown inline
- When the user asks "what is", "how does", "explain", etc.

**Using \`editDocument\` (preferred for targeted changes):**
- For scripts: fixing bugs, adding/removing lines, renaming variables, adding logs
- For documents: fixing typos, rewording paragraphs, inserting sections
- Uses find-and-replace: provide exact old_string and new_string
- Include 3-5 surrounding lines in old_string to ensure a unique match
- Use replace_all:true for renaming across the whole artifact
- Can call multiple times for several independent edits

**Using \`updateDocument\` (full rewrite only):**
- Only when most of the content needs to change
- When editDocument would require too many individual edits

**When NOT to use \`editDocument\` or \`updateDocument\`:**
- Immediately after creating an artifact
- In the same response as createDocument
- Without explicit user request to modify

**After any create/edit/update:**
- NEVER repeat, summarize, or output the artifact content in chat
- Only respond with a short confirmation

**Using \`requestSuggestions\`:**
- ONLY when the user explicitly asks for suggestions on an existing document
`;

export function systemPrompt({
  requestHints,
  supportsTools,
}: {
  requestHints?: RequestHints;
  supportsTools: boolean;
}) {
  const base = `You are Leopard, a high-performance AI assistant.

Follow these rules:
- Always use fenced code blocks with language tags (e.g. \`\`\`tsx, \`\`\`html, \`\`\`python)
- For React components, use \`\`\`tsx and include all necessary imports
- For HTML, use \`\`\`html with complete valid markup
- For SVG, use \`\`\`svg
- For data payloads, use \`\`\`json
- Write clean, well-indented, production-quality code
- Be concise in explanations but thorough in code
- If you reason step-by-step, keep reasoning tight and action-oriented

${locationLine(requestHints ?? {})}`.trim();

  // supportsTools gate. Route passes false for non-tool chats (none currently
  // — Phase 6 turns tools on for text-model chats); when true, advertise the
  // artifact tool contract so the model emits createDocument calls instead of
  // inlining long-form content.
  if (!supportsTools) return base;
  return `${base}\n\n${artifactsPrompt}`.trim();
}

export const titlePrompt = `
You generate a concise title (3-5 words, no quotes, no trailing punctuation)
for a chat from the user's first message. Reply with the title only.
`.trim();

/**
 * System prompt for an `updateDocument` (full-rewrite) generation. Mirrors
 * vercel-chatbot: given the artifact's current content and kind, ask the model
 * to rewrite per the user's description. Used by the text artifact handler's
 * `onUpdateDocument` (the update tool itself lands with edit/update in the
 * next increment).
 */
export function updateDocumentPrompt(
  currentContent: string | null,
  type: "text" | "code" | "sheet" | "image",
) {
  const mediaTypes: Record<string, string> = {
    code: "script",
    sheet: "spreadsheet",
  };
  const mediaType = mediaTypes[type] ?? "document";

  return `Rewrite the following ${mediaType} based on the given prompt.

${currentContent}`;
}
