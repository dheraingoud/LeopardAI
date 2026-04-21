export interface PromptTemplate {
  id: string;
  name: string;
  trigger: string;
  content: string;
  category: 'code' | 'sql' | 'debug' | 'architecture';
}

export const TEMPLATES_KEY = 'leopard-templates-v1';

export const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: '1',
    name: 'Code Review',
    trigger: '/review',
    content:
      'Review this code for security vulnerabilities, performance issues, and style. Be specific.',
    category: 'code',
  },
  {
    id: '2',
    name: 'Explain SQL',
    trigger: '/explain',
    content:
      'Explain this SQL query step by step, including what indexes it would use.',
    category: 'sql',
  },
  {
    id: '3',
    name: 'Debug',
    trigger: '/debug',
    content:
      'Help me debug this. Identify the root cause, not just symptoms.',
    category: 'debug',
  },
  {
    id: '4',
    name: 'Optimize',
    trigger: '/optimize',
    content: 'Optimize this for performance. Explain the tradeoffs.',
    category: 'code',
  },
  {
    id: '5',
    name: 'Architecture Review',
    trigger: '/arch',
    content:
      'Review this architecture. Identify: SPOFs, scaling bottlenecks, security gaps, and missing components.',
    category: 'architecture',
  },
];

/** Load templates from localStorage, merging custom ones with defaults. */
export function loadTemplates(): PromptTemplate[] {
  if (typeof window === 'undefined') return DEFAULT_TEMPLATES;

  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return DEFAULT_TEMPLATES;

    const saved: PromptTemplate[] = JSON.parse(raw);
    return mergeTemplates(DEFAULT_TEMPLATES, saved);
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

/** Save templates to localStorage (replacing everything). */
export function saveTemplates(templates: PromptTemplate[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

/** Add a template; generates an id via crypto.randomUUID. */
export function addTemplate(
  template: Omit<PromptTemplate, 'id'>
): PromptTemplate {
  const created: PromptTemplate = {
    ...template,
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  };
  const current = loadTemplates();
  saveTemplates([...current, created]);
  return created;
}

/** Delete a template by id and persist. */
export function deleteTemplate(id: string): PromptTemplate[] {
  const current = loadTemplates();
  const updated = current.filter((t) => t.id !== id);
  saveTemplates(updated);
  return updated;
}

/** Match a trigger like "/word" at the start of the input string. */
export function matchTrigger(input: string): PromptTemplate | undefined {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith('/')) return undefined;

  const spaceIdx = trimmed.indexOf(' ');
  const triggerWord = spaceIdx === -1
    ? trimmed.toLowerCase()
    : trimmed.slice(0, spaceIdx).toLowerCase();

  const all = loadTemplates();
  return all.find((t) => t.trigger.toLowerCase() === triggerWord);
}

/** Deep-merge default templates with saved ones, preferring saved values. */
function mergeTemplates(
  defaults: PromptTemplate[],
  saved: PromptTemplate[]
): PromptTemplate[] {
  const savedMap = new Map(saved.map((t) => [t.trigger, t]));
  const merged: PromptTemplate[] = defaults.map((d) => {
    const s = savedMap.get(d.trigger);
    return s ?? d;
  });

  // Carry over any custom triggers not in defaults
  for (const s of saved) {
    if (!defaults.some((d) => d.trigger === s.trigger)) {
      merged.push(s);
    }
  }

  return merged;
}