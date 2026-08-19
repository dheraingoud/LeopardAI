/**
 * Φ-semantic · NIM embedding + cosine ranking for memory recall (LEOPARD_
 * SEMANTIC_MEMORY). NO vector DB: on save we store the embedding as a plain
 * `number[]` column on the Convex userMemory row; at recall we embed the query
 * and brute-force cosine over that user's (small) memory set — microseconds for
 * hundreds of rows, no index needed. Brute-force kNN is the correct call until a
 * memory set reaches thousands.
 *
 * Model: `NIM_EMBED_MODEL`, default `baai/bge-m3` (1024D, unified
 * integrate.api.nvidia.com/v1/embeddings, no instruction prefix required,
 * multilingual). Pure + DI (baseUrl/apiKey/model/fetch) so it unit-tests offline.
 * Fail-closed: the caller gates on LEOPARD_SEMANTIC_MEMORY=1; any embed/rank
 * failure must fall back to the existing ordered (pinned+newest) recall — never
 * fails a turn.
 */

const EMBED_BASE = "https://integrate.api.nvidia.com/v1/embeddings";
export const EMBED_MODEL_DEFAULT = "baai/bge-m3";

export type EmbedDeps = {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

export function isSemanticMemoryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LEOPARD_SEMANTIC_MEMORY === "1" && !!env.NVIDIA_API_KEY;
}

/** Embed texts → L2-normalized float vectors (NIM returns normalized; we
 * normalize defensively so cosine == dot product downstream). Throws on failure
 * — caller decides fallback. */
export async function embedTextsDeps(
  texts: string[],
  deps: EmbedDeps,
): Promise<number[][]> {
  if (!texts.length) return [];
  const apiKey = deps.apiKey;
  if (!apiKey) throw new Error("embedding requires NVIDIA_API_KEY");
  const res = await (deps.fetchImpl ?? fetch)(deps.baseUrl ?? EMBED_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: deps.model ?? EMBED_MODEL_DEFAULT,
      input: texts,
    }),
  });
  if (!res.ok) {
    throw new Error(`embedding HTTP ${res.status}: ${(await res.text().catch(() => ""))}`);
  }
  const payload = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const vecs = (payload.data ?? [])
    .map((d) => d.embedding)
    .filter((e): e is number[] => Array.isArray(e));
  return vecs.map(normalizeVector);
}

export const embedTexts = (texts: string[]): Promise<number[][]> =>
  embedTextsDeps(texts, {
    apiKey: process.env.NVIDIA_API_KEY,
    model: process.env.NIM_EMBED_MODEL,
    baseUrl: EMBED_BASE,
  });

/** L2-normalize in place-safe copy (so cosine == dot for both normalized). */
export function normalizeVector(v: readonly number[]): number[] {
  let norm = 0;
  for (const x of v) norm += x * x;
  if (!(norm > 0)) return [...v];
  const inv = 1 / Math.sqrt(norm);
  return v.map((x) => x * inv);
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot; // both normalized → cosine == dot
}

export type EmbeddableMemory = {
  id: string;
  text: string;
  pinned?: boolean;
  updatedAt: number;
  embedding?: number[];
};

/** Rank a memory set for a query vector: pinned always first (newest first),
 * then the rest by cosine similarity (desc). Returns the full set reordered —
 * the caller's prompt bound (MAX_MEMORIES) then keeps the top slice. Memories
 * without a stored embedding sink to sim=-1 (bottom of the unpinned group). */
export function rankMemoriesByQuery(
  queryVec: readonly number[],
  memories: EmbeddableMemory[],
): EmbeddableMemory[] {
  const pinned = memories
    .filter((m) => m.pinned)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const unpinned = memories
    .filter((m) => !m.pinned)
    .map((m) => ({
      m,
      sim: m.embedding ? cosineSimilarity(queryVec, m.embedding) : -1,
    }))
    .sort((a, b) => b.sim - a.sim)
    .map((x) => x.m);
  return [...pinned, ...unpinned];
}