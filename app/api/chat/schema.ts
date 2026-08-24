import { z } from "zod";

// Per-model reasoning levels (mirrors lib/nim.ts ReasoningLevel). The route
// reads `reasoning` + nimReasoningProviderOptions() maps it to NIM body params
// (reasoning_effort for effort-param models, chat_template_kwargs.think for
// think-param models); undefined / "off" / locked-on → no param sent.
const REASONING_LEVELS = ["off", "on", "low", "medium", "high", "max"] as const;

/**
 * Request body for /api/chat.
 *
 * leopard keeps CLIENT-side persistence (Convex real-time) — the route does
 * NOT load/save from Convex. The client sends the full UIMessage history (the
 * Phase 5 useChat hook) plus the selected model. `id` is the chat's client
 * UUID, used only to decide whether to generate a title (first exchange).
 *
 * Shape intentionally close to vercel-chatbot's PostRequestBody so the Phase 5
 * ported useChat lands with minimal edits; we just don't require the
 * server-side fields (selectedVisibilityType etc.) that leopard stores client-side.
 */
export const postRequestBodySchema = z.object({
  id: z.string().optional(),
  // Full UIMessage[] history (last entry is the new user message).
  messages: z.array(z.any()),
  // Selected chat model id. Falls back to the registry default if absent.
  model: z.string().optional(),
  // Per-model reasoning level (set by the input-bar reasoning control).
  // undefined / "off" → route sends no reasoning param (NIM non-think mode).
  reasoning: z.enum(REASONING_LEVELS).optional(),
  // Φ-docs · output style (addon A): optional per-turn override of the
  // LEOPARD_OUTPUT_STYLE env default. String, sanitized in output-styles.ts
  // ("default"/unknown → baseline voice; never degrades the prompt).
  styleRequested: z.string().optional(),
  // Φ-docs · compaction focus (addon B): optional directive telling the
  // summarizer what to prioritize keeping (mirror of `/compact <focus>`).
  // Bounded in the route.
  focus: z.string().optional(),
  // Client-selected skill instruction bodies (permanent library + local "+"
  // skills). Returned server-side only as pre-filtered instruction strings;
  // bounded in the route before reaching the prompt.
  skills: z.array(z.string()).optional(),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
