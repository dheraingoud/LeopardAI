// Φ-multi-agent · spawn_agents tool.
//
// Gives the master model a team of named subagents for multi-part work.
// Subagents are headless (no chat display) but tool-capable (web search /
// fetch via the orchestrator's loop); the master keeps everything
// user-visible — final text, code, artifacts.
//
// The tool name carries NO low-risk prefix, so under ENABLE_TOOL_APPROVAL it
// lands on the AskCard (Allow/Deny) before anything spawns. Env-gated via
// LEOPARD_MULTI_AGENTS=1.

import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { ChatMessage } from "@/lib/types";
import { runOrchestration } from "@/lib/ai/agents/orchestrator";

export type AgentsToolContext = {
  dataStream: UIMessageStreamWriter<ChatMessage>;
  userId?: string;
  /** Generation abort signal — Stop must cancel running subagents too,
   *  otherwise the card stays "running" for up to 120s/agent after the
   *  stream is already dead (observed 2026-09-02: frozen stop state). */
  abortSignal?: AbortSignal;
};

const taskSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(60)
    .describe("Short role label for this agent, e.g. 'source scout' or 'draft writer' — shown in the UI"),
  kind: z
    .enum(["research", "write", "verify", "general"])
    .describe("research = gather sources; write = draft content; verify = check prior outputs; general = anything else"),
  // Generous cap — verbose master models (DeepSeek Flash writes 500+ char
  // briefs) must not fail validation; the orchestrator clips to MAX_TASK on
  // its side anyway. A hard 500 here killed the whole turn with
  // AI_TypeValidationError (2026-09-02).
  task: z.string().min(1).max(2000).describe("What this agent should do, stated concretely"),
});

export const agentsTools = ({ dataStream, userId, abortSignal }: AgentsToolContext) => ({
  spawn_agents: tool({
    description:
      "Spawn a small team of subagents (2-4) for a task that genuinely splits " +
      "into parts — e.g. one agent researches sources, one drafts, one " +
      "verifies. Each gets a role name, a kind, and a concrete task; they run " +
      "on a fast utility model with web search/fetch access and see prior " +
      "agents' outputs. You receive compacted per-agent outputs — synthesize " +
      "them into YOUR answer. You remain responsible for everything the user " +
      "sees (final text, code, artifacts). Never use for a simple question.",
    inputSchema: z.object({
      tasks: z.array(taskSchema).min(2).max(5).describe("The subagent team to run"),
    }),
    execute: async ({ tasks }, { toolCallId }) => {
      try {
        const agents = await runOrchestration({
          toolCallId,
          tasks,
          userId,
          abortSignal,
          emit: (event) => {
            dataStream.write({ type: "data-orchestration", data: event });
          },
        });
        const done = agents.filter((a) => a.status === "done").length;
        return {
          summary: `${done}/${agents.length} agents completed.`,
          agents: agents.map((a) => ({
            name: a.name,
            kind: a.kind,
            status: a.status,
            output: a.output ?? a.note ?? "(no output)",
          })),
          note: "Synthesize these outputs into your final answer to the user.",
        };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : String(err),
          note: "Orchestration failed — answer from your own knowledge instead.",
        };
      }
    },
  }),
});
