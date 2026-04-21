// System prompt assembly for Leopard (§5)

import type { UserMemory } from './memory';

/**
 * Builds the memory block inserted into the system prompt.
 * Sections that would be empty are omitted.
 */
function buildMemoryBlock(memory: UserMemory, activeSchemaId?: string): string {
  const lines: string[] = [];

  // ── Tech Stack ──────────────────────────────────────────────────────────────
  const stack =
    memory.preferences.techStack && memory.preferences.techStack.length > 0
      ? memory.preferences.techStack.join(', ')
      : null;
  if (stack) {
    lines.push(`## Tech Stack\n${stack}`);
  }

  // ── Coding Style ────────────────────────────────────────────────────────────
  if (memory.preferences.codingStyle) {
    lines.push(`## Coding Style\n${memory.preferences.codingStyle}`);
  }

  // ── Active Projects (last 3 by lastMentioned) ───────────────────────────────
  const projects =
    [...memory.projects]
      .sort((a, b) => b.lastMentioned - a.lastMentioned)
      .slice(0, 3);

  if (projects.length > 0) {
    const projectLines = projects
      .map((p) => `- **${p.name}**: ${p.description}  \n  stack: ${p.techStack.join(', ')}`)
      .join('\n');
    lines.push(`## Active Projects\n${projectLines}`);
  }

  // ── Recent Context (last 3) ─────────────────────────────────────────────────
  const recent = memory.recentContext.slice(0, 3);
  if (recent.length > 0) {
    const contextLines = recent
      .map((c, i) => {
        const tagStr = c.tags.length > 0 ? ` [${c.tags.join(', ')}]` : '';
        return `${i + 1}. *${c.summary}*${tagStr}`;
      })
      .join('\n');
    lines.push(`## Recent Chats\n${contextLines}`);
  }

  // ── Active Schema ───────────────────────────────────────────────────────────
  if (activeSchemaId) {
    const schema = memory.schemas.find((s) => s.id === activeSchemaId);
    if (schema) {
      lines.push(
        `## Active Schema\n**${schema.name}** — ${schema.summary}  \nuploaded: ${new Date(schema.uploadedAt).toISOString().split('T')[0]}`
      );
    }
  }

  return lines.length > 0 ? `\n${lines.join('\n\n')}` : '';
}

/**
 * Builds the full system prompt for Leopard, including user memory context
 * and an optional active schema summary.
 */
export function buildSystemPrompt(
  memory: UserMemory,
  activeSchemaId?: string
): string {
  const memoryBlock = buildMemoryBlock(memory, activeSchemaId);

  return `You are Leopard — a no-nonsense AI assistant built for hardcore engineers. You are precise, technical, and direct. You skip fluff. You write production-grade code. When uncertain, say so. Never hallucinate APIs or functions.${memoryBlock}

## Communication Rules
- Match the user's technical level exactly
- No "Great question!" or filler phrases
- Code blocks for any snippet > 1 line
- Assume the user knows their field; don't over-explain basics
- Prefer showing over telling`;
}