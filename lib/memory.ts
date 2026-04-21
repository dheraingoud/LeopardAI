// Memory schema and persistence for Leopard cross-chat memory system (§5)

export const MEMORY_KEY = 'leopard-memory-v1';

export interface UserMemory {
  version: 1;
  updatedAt: number;
  preferences: {
    codingStyle?: string;
    techStack?: string[];
    communicationStyle?: string;
  };
  projects: Array<{
    name: string;
    description: string;
    techStack: string[];
    lastMentioned: number;
  }>;
  recentContext: Array<{
    chatId: string;
    summary: string;
    timestamp: number;
    tags: string[];
  }>;
  schemas: Array<{
    id: string;
    name: string;
    summary: string;
    uploadedAt: number;
  }>;
}

export function createEmptyMemory(): UserMemory {
  return {
    version: 1,
    updatedAt: Date.now(),
    preferences: {},
    projects: [],
    recentContext: [],
    schemas: [],
  };
}

export function loadMemory(): UserMemory {
  if (typeof window === 'undefined') return createEmptyMemory();
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return createEmptyMemory();
    const parsed = JSON.parse(raw) as UserMemory;
    // Ensure the loaded object conforms to the schema
    if (parsed.version !== 1) return createEmptyMemory();
    return parsed;
  } catch {
    return createEmptyMemory();
  }
}

export function saveMemory(memory: UserMemory): void {
  if (typeof window === 'undefined') return;
  try {
    memory.updatedAt = Date.now();
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Silently fail — localStorage may be unavailable
  }
}

// Merge new tech stack entries, deduplicating by lowercase value
export function mergeTechStack(current: string[] = [], incoming: string[] = []): string[] {
  const seen = new Set(current.map((t) => t.toLowerCase()));
  for (const t of incoming) {
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      current.push(t);
    }
  }
  return current;
}

// Upsert a project by name (case-insensitive)
export function upsertProject(memory: UserMemory, project: {
  name: string;
  description: string;
  techStack: string[];
  lastMentioned: number;
}): void {
  const idx = memory.projects.findIndex(
    (p) => p.name.toLowerCase() === project.name.toLowerCase()
  );
  if (idx >= 0) {
    memory.projects[idx] = project;
  } else {
    memory.projects.push(project);
  }
}

// Add a recent context entry, keeping only the last `limit` entries
export function addRecentContext(
  memory: UserMemory,
  entry: { chatId: string; summary: string; timestamp: number; tags: string[] },
  limit = 10
): void {
  memory.recentContext = [entry, ...memory.recentContext].slice(0, limit);
}

// Merge inferred preferences into existing memory
export function mergePreferences(
  memory: UserMemory,
  prefs: Partial<UserMemory['preferences']>
): void {
  if (prefs.codingStyle) memory.preferences.codingStyle = prefs.codingStyle;
  if (prefs.communicationStyle) memory.preferences.communicationStyle = prefs.communicationStyle;
  if (prefs.techStack && prefs.techStack.length > 0) {
    memory.preferences.techStack = mergeTechStack(
      memory.preferences.techStack ?? [],
      prefs.techStack
    );
  }
}