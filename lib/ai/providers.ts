/**
 * Provider dispatch — single entry point the route uses to resolve a model id
 * to an AI SDK v6 LanguageModel.
 *
 *   NIM      → @ai-sdk/openai-compatible pointed at NVIDIA NIM's
 *              OpenAI-compatible /v1/chat/completions endpoint.
 *              NIM is NOT routed through the Vercel AI Gateway (different id
 *              space: leopard uses deepseek-ai/deepseek-v3-2; gateway uses
 *              deepseek/deepseek-v3.2), so it needs a direct provider.
 *   gateway  → built-in `gateway` from `ai` (Vercel AI Gateway).
 *
 * Title model = the utility model (lib/ai/models UTILITY_MODEL), routed the
 * same way. Generated server-side and emitted as a `data-chat-title` part so
 * the (client-persist) Phase 5 hook can call api.chats.updateTitle.
 *
 * Retry / fallback-model / context-truncation hardening from the legacy route
 * is deferred to Phase 9 — Phase 4 is basic streaming + AI SDK v6 wiring.
 */
import { gateway, type LanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { NIM_BASE } from "@/lib/nim";
import { getDefaultChatModel, getModelById, getUtilityModel } from "@/lib/ai/models";

// openai-compatible@3.0.5 emits `specificationVersion: "v4"`, but ai@6's
// `resolveLanguageModel` only accepts "v2" or "v3" — v4 is rejected with
// AI_UnsupportedModelVersionError before any streaming starts. The runtime
// methods are structurally compatible (v4 is a superset of v3), so we
// Proxy-wrap the NIM model to report "v3" and let ai@6's `asLanguageModelV3`
// pass it through unchanged. (The gateway provider already emits "v3" — no
// wrap needed.) Mirrors the SDK's own asLanguageModelV3 Proxy pattern.
function asV3(model: LanguageModel): LanguageModel {
  return new Proxy(model as object, {
    get(target, prop, receiver) {
      if (prop === "specificationVersion") return "v3";
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as LanguageModel;
}

// NIM direct (OpenAI-compatible). The apiKey comes from the rotator pool
// (lib/ai/nim-keys) — NOT read once at module load. A custom fetch injects the
// current best key per request and reports 401/403 (dead) / 429/5xx (backoff)
// back to the pool, so a single dead key no longer takes inference down
// (2026-10-05 incident). If no key is configured the provider still
// constructs and streamText surfaces the 401, mapped by onError.
import { currentNimKey, reportNimKeyFailure } from "@/lib/ai/nim-keys";

const nimFetch: typeof fetch = async (input, init) => {
  const key = currentNimKey();
  const headers = new Headers(init?.headers);
  if (key) headers.set("Authorization", `Bearer ${key}`);
  const res = await fetch(input, { ...init, headers });
  // Only report on a definitive answer (a response came back at all).
  if (key && (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500)) {
    reportNimKeyFailure(key, res.status);
  }
  return res;
};

export const nimProvider = createOpenAICompatible({
  name: "nim",
  baseURL: NIM_BASE,
  apiKey: process.env.NVIDIA_API_KEY ?? "", // placeholder; real key injected per-request below
  fetch: nimFetch,
  // NIM (OpenAI-compatible) only emits a usage chunk when asked. Without this
  // result.usage resolves to zeros and every usageLog row records 0 tokens
  // (found 2026-08-31: usage readout showed "0 tokens" for real turns).
  includeUsage: true,
});

export function getLanguageModel(modelId: string): LanguageModel {
  const model = getModelById(modelId);
  if (model?.provider === "nim") {
    return asV3(nimProvider.chatModel(modelId) as unknown as LanguageModel);
  }
  if (model?.provider === "gateway") {
    return gateway.languageModel(modelId) as unknown as LanguageModel;
  }
  // Unknown id → NEVER silently relay to an arbitrary provider. In the old
  // code any non-nim id (including a client-crafted string) fell through to
  // `gateway.languageModel(id)`, which would proxy to whatever provider/endpoint
  // that id named once an AI_GATEWAY_API_KEY was present — an open relay for
  // model-id injection. The /api/chat route now allowlists explicit requests
  // and fails loudly on unknown ids, so a bad id reaching here is a bug in a
  // caller. Fail to the trusted server default instead of relaying. getDefaultChatModel()
  // always resolves to an active registry id, so this recursion is depth-1.
  return getLanguageModel(getDefaultChatModel().id);
}

export function getTitleModel(): LanguageModel {
  const util = getUtilityModel();
  if (util.provider === "nim") {
    return asV3(nimProvider.chatModel(util.id) as unknown as LanguageModel);
  }
  return gateway.languageModel(util.id) as unknown as LanguageModel;
}
