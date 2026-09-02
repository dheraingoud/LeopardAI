// Φ-multi-agent · orchestrator (lead + subagents pattern).
//
// The MASTER model stays in charge of everything user-visible: final answer,
// code snippets, artifacts, formatting. When a request splits into parts it
// calls `spawn_agents` with a small team — each subagent NAMED by its role
// (e.g. "source scout", "draft writer") — and the orchestrator runs them
// headless on the utility model (UTILITY_MODEL in lib/nim).
//
// Subagents are full tool users: they run a bounded agentic loop (generateText
// + stopWhen) with the app's read-side tools (web search, web fetch) and see
// prior subagents' outputs, so research → write → verify chains compose.
// They are TEMPORARY and have NO chat display — they return compact outputs
// to the master, which synthesizes and renders everything the user sees.
//
// Progress reaches the client as `data-orchestration` snapshots (one per
// transition: proposed → agent running/done → handoff → synthesizing) that
// the inline AgentRunCard renders.

import { generateText, stepCountIs } from "ai";
import { getLanguageModel } from "@/lib/ai/providers";
import { webSearch } from "@/lib/ai/tools/web-search";
import { webFetch } from "@/lib/ai/tools/web-fetch";
import { UTILITY_MODEL } from "@/lib/nim";

export type AgentKind = "research" | "write" | "verify" | "general";
export type AgentStatus = "pending" | "running" | "done" | "error";

export interface OrchTask {
  /** Role label chosen by the master model — shown in the card. */
  name: string;
  kind: AgentKind;
  task: string;
}

export interface OrchAgentState extends OrchTask {
  status: AgentStatus;
  /** One-line live activity note. */
  note?: string;
  /** Wall-clock ms when the agent started running. */
  startedAt?: number;
  /** Final run time in ms (set on done/error). */
  durationMs?: number;
  /** Compacted final output (returned to the master model). */
  output?: string;
}

export type OrchPhase = "proposed" | "agent" | "handoff" | "synthesizing";

export interface OrchestrationEvent {
  toolCallId: string;
  phase: OrchPhase;
  agents: OrchAgentState[];
  /** Present on phase === "handoff". */
  handoff?: { from: string; to: string; reason: string };
}

const MAX_AGENTS = 5;
const MAX_TASK = 500;
const MAX_STEPS = 6;
/** One agent can hang (model stall, upstream outage) — never let it freeze
 *  the whole run: 120s ceiling, then the agent is marked error and the team
 *  moves on. The card ALWAYS reaches a settled state. */
const AGENT_TIMEOUT_MS = 120_000;
/** Retry pass ceiling — plain generateText, no tool loop, so it should land fast. */
const RETRY_TIMEOUT_MS = 60_000;
const PRIOR_OUTPUT_CAP = 1500;
const OUTPUT_CAP = 2500;

const KIND_GUIDANCE: Record<AgentKind, string> = {
  research:
    "Gather facts and sources for the task. Use web search / fetch freely. " +
    "Return concise findings with source links.",
  write:
    "Draft the requested content as clean markdown, using prior agents' " +
    "outputs as source material.",
  verify:
    "Check the prior agents' outputs against the task: flag errors, gaps, " +
    "and unsupported claims, and give a corrected version where needed.",
  general: "Complete the task directly, using prior agents' outputs as context.",
};

const SUBAGENT_SYSTEM =
  "You are a temporary subagent in a multi-agent team. You have NO user-facing " +
  "display — your text output goes back to the lead agent, which presents " +
  "everything to the user. So: do the work, return the material, no preamble, " +
  "no 'as an AI' filler, no asking questions.";

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Subagent failures land in the UI as one-word "failed" — useless for RCA.
 *  Mirror every failure to a JSONL log the probes can read (2026-09-02). */
function logAgentError(agent: string, phase: string, error: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    fs.appendFileSync(
      "orchestrator-errors.jsonl",
      JSON.stringify({ t: new Date().toISOString(), agent, phase, error }) + "\n",
    );
  } catch {
    /* logging must never break the run */
  }
}

async function runAgent(
  agent: OrchAgentState,
  priorOutputs: Array<{ name: string; output: string }>,
  modelId: string,
  abortSignal?: AbortSignal,
  onActivity?: (note: string) => void,
): Promise<string> {
  const context = priorOutputs.length
    ? "\n\nPrior subagent outputs:\n" +
      priorOutputs.map((p) => `### ${p.name}\n${clip(p.output, PRIOR_OUTPUT_CAP)}`).join("\n\n")
    : "";

  const system = `${SUBAGENT_SYSTEM}\n\nRole (${agent.kind}): ${KIND_GUIDANCE[agent.kind]}`;
  const prompt = `Task: ${agent.task}${context}`;
  const model = getLanguageModel(modelId);
  const first = await generateText({
    model,
    system,
    prompt,
    tools: { webSearch: webSearch(), webFetch: webFetch({}) },
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: 1500,
    abortSignal,
    // Live activity for the card: every step surfaces WHAT the agent is doing
    // — "searching: <query>", "fetching: <url>", or "writing" — not just the
    // static kind hint (operator 2026-09-02).
    onStepFinish: (step) => {
      const calls = (step.toolCalls ?? []) as Array<{ toolName?: string; input?: unknown }>;
      const last = calls[calls.length - 1];
      if (!last) {
        if (step.text?.trim()) onActivity?.("writing");
        return;
      }
      const input = (last.input ?? {}) as Record<string, unknown>;
      const target =
        (typeof input.url === "string" && input.url) ||
        (typeof input.query === "string" && input.query) ||
        "";
      const verb =
        last.toolName === "webSearch" ? "searching" : last.toolName === "webFetch" ? "fetching" : `using ${last.toolName ?? "tool"}`;
      onActivity?.(target ? `${verb}: ${clip(target, 60)}` : verb);
    },
  });
  let text = first.text.trim();
  if (!text) {
    // The model spent every step on tool calls (finishReason tool-calls) and
    // produced NO text — forcing toolChoice:"none" mid-loop doesn't help
    // either (the model just rambles its "thinking process" as text). Run a
    // dedicated tools-free pass over the gathered results (2026-09-01).
    const gathered = first.steps
      .flatMap((s) =>
        (s.toolResults ?? []).map((tr) => {
          const out = (tr as { output?: unknown }).output;
          return typeof out === "string" ? out : JSON.stringify(out ?? "");
        }),
      )
      .join("\n\n")
      .slice(0, 6000);
    const second = await generateText({
      model,
      system,
      prompt: `${prompt}\n\nResearch material already gathered:\n${gathered || "(no usable results)"}\n\nWrite the final output now. No tool calls.`,
      maxOutputTokens: 1500,
      abortSignal,
    });
    text = second.text.trim();
  }
  return text;
}

/**
 * Run the team sequentially (NIM rate limits). Emits a full-state snapshot on
 * every transition; a failing agent is marked error and the loop continues.
 * Returns the settled agents (statuses + compacted outputs) for the tool
 * result the master model synthesizes from.
 */
export async function runOrchestration(input: {
  toolCallId: string;
  tasks: OrchTask[];
  userId?: string;
  modelId?: string;
  /** Stop/abort signal from the generation controller — cancels in-flight
   *  subagent calls and skips queued agents so Stop settles immediately. */
  abortSignal?: AbortSignal;
  emit: (event: OrchestrationEvent) => void;
}): Promise<OrchAgentState[]> {
  const agents: OrchAgentState[] = input.tasks.slice(0, MAX_AGENTS).map((t) => ({
    name: clip(t.name, 60),
    kind: t.kind,
    task: clip(t.task, MAX_TASK),
    status: "pending",
  }));
  const modelId = input.modelId ?? UTILITY_MODEL;
  const emit = (phase: OrchPhase, handoff?: OrchestrationEvent["handoff"]) =>
    input.emit({
      toolCallId: input.toolCallId,
      phase,
      agents: agents.map((a) => ({ ...a })),
      ...(handoff ? { handoff } : {}),
    });

  emit("proposed");
  const priorOutputs: Array<{ name: string; output: string }> = [];

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    // Stop hit between agents → mark everything remaining error and bail,
    // so the card settles instead of hanging "running" forever.
    if (input.abortSignal?.aborted) {
      for (const rest of agents.slice(i)) {
        if (rest.status === "pending") rest.status = "error";
        rest.note = "stopped";
      }
      emit("synthesizing");
      return agents;
    }
    agent.status = "running";
    agent.startedAt = Date.now();
    agent.durationMs = undefined;
    agent.note =
      agent.kind === "research"
        ? "searching the web"
        : agent.kind === "verify"
          ? "checking prior outputs"
          : "working";
    emit("agent");
    try {
      const output = await Promise.race([
        runAgent(agent, priorOutputs, modelId, input.abortSignal, (note) => {
          agent.note = note;
          emit("agent");
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("agent timed out")), AGENT_TIMEOUT_MS),
        ),
        // Stop during a subagent's model call: reject immediately instead of
        // waiting out the 120s ceiling (the generateText abortSignal also
        // fires, but a hung tool inside the loop could ignore it).
        new Promise<never>((_, reject) => {
          const sig = input.abortSignal;
          if (!sig) return;
          if (sig.aborted) reject(new Error("stopped"));
          else sig.addEventListener("abort", () => reject(new Error("stopped")), { once: true });
        }),
      ]);
      agent.output = clip(output, OUTPUT_CAP);
      agent.status = "done";
      agent.note = undefined;
      agent.durationMs = agent.startedAt ? Date.now() - agent.startedAt : undefined;
      priorOutputs.push({ name: agent.name, output: agent.output });
    } catch (err) {
      const firstError = err instanceof Error ? err.message : String(err);
      logAgentError(agent.name, "attempt-1", firstError);
      console.warn(`[orchestrator] agent "${agent.name}" failed attempt 1: ${firstError}`);
      // AT ANY COST: retry once, tools-free, tighter ceiling. Most failures are
      // upstream hangs in the tool loop (nemotron-lightning stalls) — a plain
      // generateText over prior context usually lands. (2026-09-02 RCA)
      agent.note = "retrying";
      emit("agent");
      try {
        const retry = await Promise.race([
          generateText({
            model: getLanguageModel(modelId),
            system: `${SUBAGENT_SYSTEM}\n\nRole (${agent.kind}): ${KIND_GUIDANCE[agent.kind]}`,
            prompt:
              `Task: ${agent.task}` +
              (priorOutputs.length
                ? "\n\nPrior subagent outputs:\n" +
                  priorOutputs.map((p) => `### ${p.name}\n${clip(p.output, PRIOR_OUTPUT_CAP)}`).join("\n\n")
                : "") +
              "\n\nAnswer directly from your own knowledge. No tool calls.",
            maxOutputTokens: 1500,
            abortSignal: input.abortSignal,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("retry timed out")), RETRY_TIMEOUT_MS),
          ),
        ]);
        const text = retry.text.trim();
        if (!text) throw new Error("empty retry output");
        agent.output = clip(text, OUTPUT_CAP);
        agent.status = "done";
        agent.note = undefined;
        agent.durationMs = agent.startedAt ? Date.now() - agent.startedAt : undefined;
        priorOutputs.push({ name: agent.name, output: agent.output });
      } catch (err2) {
        agent.status = "error";
        agent.note = err2 instanceof Error ? err2.message : String(err2);
        agent.durationMs = agent.startedAt ? Date.now() - agent.startedAt : undefined;
        logAgentError(agent.name, "retry", agent.note);
        console.warn(`[orchestrator] agent "${agent.name}" failed retry: ${agent.note}`);
      }
    }
    emit("agent");

    const next = agents[i + 1];
    if (next && agent.status === "done") {
      emit("handoff", {
        from: agent.name,
        to: next.name,
        reason: `${agent.name} finished — passing its output to ${next.name}.`,
      });
    }
  }

  emit("synthesizing");
  return agents;
}
