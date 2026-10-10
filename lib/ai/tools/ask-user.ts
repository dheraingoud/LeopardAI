import { tool } from "ai";
import { z } from "zod";

// askUser — a client-side tool the model calls to ask the user a structured
// clarifying question with clickable options instead of free prose. The call
// is approval-gated (needsApproval → the route's toolApproval returns
// "user-approval") so the turn holds open until the user picks an option; the
// choice rides the resume POST as the tool's output. See the approval hold
// path (lib/ai/server-generation.ts) for the pause/resume machinery this
// reuses.
export const askUser = () =>
  tool({
    description:
      "Ask the user a clarifying question with a short list of clickable " +
      "options. Use ONLY when the answer materially changes what you do next " +
      "and guessing would risk a wrong or wasted turn — never for small talk " +
      "or when a reasonable default exists. Keep options to 2-4 short, " +
      "mutually exclusive choices; the user can also just type instead.",
    inputSchema: z.object({
      question: z.string().describe("The question to ask, one sentence."),
      options: z
        .array(z.string())
        .min(2)
        .max(4)
        .describe("2-4 short, mutually exclusive choices."),
    }),
    // Server-side no-op: the user's choice is the "output". The resume path
    // (route.ts) synthesizes it from the approval decision and never re-invokes
    // execute. Present so the call is a real tool the SDK can gate.
    execute: async ({ question, options }) => ({
      question,
      options,
      answered: false,
    }),
  });

export type AskUserInput = { question: string; options: string[] };
