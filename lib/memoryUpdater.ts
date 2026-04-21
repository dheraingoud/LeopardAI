// Background memory update via NIM utility model (§5)

import {
  loadMemory,
  saveMemory,
  mergeTechStack,
  upsertProject,
  addRecentContext,
  mergePreferences,
} from './memory';

const NIM_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const UTILITY_MODEL = 'stepfun/step-3-5-flash';

const MAX_MESSAGE_CHARS = 500;
const MAX_TOTAL_CHARS = 8000;

// System prompt instructing the model to extract structured memory fields
const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction assistant. Given a chat transcript, respond ONLY with a valid JSON object (no markdown fences, no commentary) with these exact keys:
{
  "summary": "2-3 sentence summary of what this chat was about",
  "tags": ["tag1", "tag2"],
  "tech_stack_mentions": ["Python", "FastAPI"],
  "projects_mentioned": [{"name": "ProjectName", "description": "brief description", "techStack": ["stack1"]}],
  "preferences_inferred": {
    "codingStyle": "e.g. functional, OOP, prefers async/await",
    "techStack": ["additional inferred stack items"],
    "communicationStyle": "e.g. terse, verbose, likes diagrams"
  }
}
Be strict — return only JSON.`;

interface ExtractionResult {
  summary: string;
  tags: string[];
  tech_stack_mentions: string[];
  projects_mentioned: Array<{
    name: string;
    description: string;
    techStack: string[];
  }>;
  preferences_inferred: {
    codingStyle?: string;
    communicationStyle?: string;
    techStack?: string[];
  };
}

/**
 * Fire-and-forget background update. Trims messages, sends to NIM,
 * parses the JSON response, and merges findings into localStorage memory.
 *
 * @param chat           - The chat session to analyze
 * @param apiKey         - NIM API key (Bearer token)
 * @param activeSchemaId - (optional) id of a schema currently in use, stored in memory
 */
export async function updateMemoryFromChat(
  chat: {
    id: string;
    messages: Array<{ role: string; content: string }>;
    model?: string;
  },
  apiKey: string,
  activeSchemaId?: string
): Promise<void> {
  if (!apiKey || !chat || !chat.messages?.length) return;

  try {
    // ── Filter and truncate messages ──────────────────────────────────────────
    const truncated = chat.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role,
        content:
          m.content.length > MAX_MESSAGE_CHARS
            ? m.content.slice(0, MAX_MESSAGE_CHARS) + '…'
            : m.content,
      }));

    const allText = truncated.map((m) => `${m.role}: ${m.content}`).join('\n');
    const userText =
      allText.length > MAX_TOTAL_CHARS
        ? allText.slice(0, MAX_TOTAL_CHARS) + '…'
        : allText;

    // ── Call NIM ──────────────────────────────────────────────────────────────
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(NIM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: UTILITY_MODEL,
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: userText },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return;

    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw: string = json?.choices?.[0]?.message?.content ?? '';

    // ── Parse JSON ────────────────────────────────────────────────────────────
    const cleaned = raw.replace(/```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const extracted: ExtractionResult = JSON.parse(cleaned);

    // ── Merge into memory ─────────────────────────────────────────────────────
    const memory = loadMemory();

    // Record active schema if provided
    if (activeSchemaId) {
      const exists = memory.schemas.some((s) => s.id === activeSchemaId);
      if (!exists) {
        // Placeholder — caller should call addSchemaToMemory() separately with real metadata
        memory.schemas.push({
          id: activeSchemaId,
          name: activeSchemaId,
          summary: 'schema in use',
          uploadedAt: Date.now(),
        });
      }
    }

    // Merge tech stack (deduplicated)
    if (extracted.tech_stack_mentions?.length) {
      memory.preferences.techStack = mergeTechStack(
        memory.preferences.techStack ?? [],
        extracted.tech_stack_mentions
      );
    }

    // Upsert projects
    if (extracted.projects_mentioned?.length) {
      for (const proj of extracted.projects_mentioned) {
        upsertProject(memory, {
          ...proj,
          techStack: proj.techStack ?? [],
          lastMentioned: Date.now(),
        });
      }
    }

    // Merge preferences
    if (extracted.preferences_inferred) {
      mergePreferences(memory, extracted.preferences_inferred);
    }

    // Add recent context entry
    addRecentContext(memory, {
      chatId: chat.id,
      summary: extracted.summary,
      timestamp: Date.now(),
      tags: (extracted.tags ?? []).slice(0, 10),
    });

    saveMemory(memory);
  } catch {
    // Fire-and-forget — all errors are swallowed
  }
}

/**
 * Helper to add schema metadata to memory (call this when a schema is first loaded).
 */
export function addSchemaToMemory(
  id: string,
  name: string,
  summary: string,
  uploadedAt: number = Date.now()
): void {
  const memory = loadMemory();
  if (!memory.schemas.some((s) => s.id === id)) {
    memory.schemas.push({ id, name, summary, uploadedAt });
    saveMemory(memory);
  }
}