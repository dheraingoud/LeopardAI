/**
 * repairToolCall — last-ditch salvage for mangled tool calls.
 *
 * Weak master models (nemotron-lightning, kimi) sometimes emit Hermes-style
 * `<tool_call><function=spawn_agents><parameter=tasks>[…]` DSL or half-JSON
 * instead of clean tool input. The SDK type-checks the input, fails, and the
 * whole turn errors out. When the tool is spawn_agents we can recover: the
 * payload always contains name:/task: pairs, so regex them out and rebuild a
 * valid {tasks:[…]} input. Anything unsalvageable returns null → the original
 * error path runs unchanged.
 */
import type { ToolCallRepairFunction } from "ai";

const NAME_RE = /"?(?:name)"?\s*:\s*"([^"]+)"/;
const TASK_RE = /"?(?:task)"?\s*:\s*"([^"]+)"/;
const KIND_RE = /"?(?:kind)"?\s*:\s*"([^"]+)"/;

const KINDS = new Set(["research", "write", "verify", "general"]);

export const repairToolCall: ToolCallRepairFunction<any> = async ({
  toolCall,
}) => {
  if (toolCall.toolName !== "spawn_agents") return null;
  const raw =
    typeof toolCall.input === "string"
      ? toolCall.input
      : JSON.stringify(toolCall.input ?? "");

  // Split on object boundaries — each task object carries its own name/task.
  const chunks = raw.split(/\}\s*[,\]]/).filter((c) => c.includes("task"));
  const tasks: { name: string; kind: string; task: string }[] = [];
  for (const chunk of chunks) {
    const name = NAME_RE.exec(chunk)?.[1];
    const task = TASK_RE.exec(chunk)?.[1];
    if (!name || !task) continue;
    const kindRaw = KIND_RE.exec(chunk)?.[1] ?? "general";
    tasks.push({
      // Clip to the schema caps — a repaired call must re-validate.
      name: name.slice(0, 60),
      kind: KINDS.has(kindRaw) ? kindRaw : "general",
      task: task.slice(0, 2000),
    });
  }
  if (tasks.length === 0) return null;
  return { ...toolCall, input: JSON.stringify({ tasks }) };
};
