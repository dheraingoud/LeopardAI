// Φ-docs · deep-research — model tool.
//
// When the user asks something that benefits from genuine multi-source study,
// the model can hand it to a DETACHED research worker (lib/ai/research/worker):
// spawn returns a jobId instantly, the loop plans → searches → synthesizes in
// the background (surviving a page reload), and only the final markdown report
// comes back as the tool result. Envelope, never throws.
//
// Gating rides the same operator switch as the REST API (LEOPARD_DEEP_RESEARCH
// =1); the route only mounts this tool when that flag is set, and treats it as
// low-risk (auto-approve unless TOOL_APPROVAL_RULES explicitly deny).

import { tool } from "ai";
import { z } from "zod";
import { spawnResearch } from "@/lib/ai/research/worker";

export type ResearchToolContext = { userId: string; modelId: string };

const MAX_QUERY = 2000;

export const researchTools = ({ userId, modelId }: ResearchToolContext) => ({
  // Member tool names: key prefix `research_` so the route's gate can treat
  // the whole family as low-risk and rules can scope it (`research_=deny`).
  research_deep: tool({
    description:
      "Run deep research on a question: plan sub-queries, search the web per " +
      "sub-query, and produce a complete cited markdown report. Spawns a " +
      "background job — this call returns a jobId immediately. The job appears " +
      "in the research panel with live progress, and the final report is " +
      "written there. Use it when the user wants breadth (several viewpoints, " +
      "facts checked across sources), not a quick answer.",
    inputSchema: z.object({
      query: z
        .string()
        .max(MAX_QUERY)
        .describe("The research question to investigate, stated as plainly as the user asked."),
    }),
    execute: async ({ query }) => {
      try {
        const { id } = spawnResearch({ query, modelId, userId });
        return {
          jobId: id,
          status: "queued",
          note: "Deep research started — track it in the research panel.",
        };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : String(err),
          note: "Could not start deep research — tell the user to try again.",
        };
      }
    },
  }),
});