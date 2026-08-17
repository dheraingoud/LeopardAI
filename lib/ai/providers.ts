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

// NIM direct (OpenAI-compatible). apiKey read at module load; if the env is
// unset the provider still constructs but streamText will surface the 401,
// which onError maps to a user-safe message. The route pre-checks for nim
// models and returns a clear 500 before streaming when the key is missing.
const nimApiKey = process.env.NVIDIA_API_KEY ?? "";

export const nimProvider = createOpenAICompatible({
  name: "nim",
  baseURL: NIM_BASE,
  apiKey: nimApiKey,
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
