import { getActiveModels, getCapabilities } from "@/lib/ai/models";

/**
 * GET /api/models — single source for the model selector.
 *
 * Returns `{ models, capabilities }`:
 *   - models:       the env-filtered active list (text/image/video, both providers)
 *   - capabilities:  per-model { tools, vision, reasoning } — gateway flags come
 *                   from a 24h-cached fetch of ai-gateway.vercel.sh; NIM flags
 *                   are derived from MODEL_REGISTRY in lib/ai/models.ts.
 *
 * Replaces the inline FAST/SLOW/VISION/GENERATION_ONLY/VIDEO sets that used to
 * live in app/api/chat/route.ts. The selector fetches this instead of importing
 * getActiveModels() directly (client-side env reads are undefined → seeds).
 */
export async function GET() {
  const headers = {
    "Cache-Control": "public, max-age=86400, s-maxage=86400",
  };

  const models = getActiveModels();

  try {
    const capabilities = await getCapabilities();
    return Response.json({ models, capabilities }, { headers });
  } catch {
    // degrade gracefully — selector falls back to per-model flags on the client
    return Response.json({ models, capabilities: {} }, { headers });
  }
}
