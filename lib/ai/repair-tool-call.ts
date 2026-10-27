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
 *
 * Schema-shaped repairs (webSearch/askUser/createDocument/renderWidget) live
 * in lib/ai/tool-input-repair.ts: they coerce the arguments a model actually
 * emits into inputs the tool's own schema accepts, so a malformed call
 * succeeds instead of painting an error card.
 */
import type { ToolCallRepairFunction } from "ai";
import {
  repairAskUserInput,
  repairCreateDocumentInput,
  repairRenderWidgetInput,
  repairWebSearchInput,
} from "@/lib/ai/tool-input-repair";

const NAME_RE = /"?(?:name)"?\s*:\s*"([^"]+)"/;
const TASK_RE = /"?(?:task)"?\s*:\s*"([^"]+)"/;
const KIND_RE = /"?(?:kind)"?\s*:\s*"([^"]+)"/;

const KINDS = new Set(["research", "write", "verify", "general"]);

const SCHEMA_REPAIRS: Record<
  string,
  (input: unknown) => Record<string, unknown> | null
> = {
  webSearch: repairWebSearchInput,
  askUser: repairAskUserInput,
  createDocument: repairCreateDocumentInput,
  renderWidget: repairRenderWidgetInput,
};

export const repairToolCall: ToolCallRepairFunction<any> = async ({
  toolCall,
}) => {
  // webFetch: a model retry can blow the max_bytes cap (observed 2026-10-11:
  // a failed fetch retried with max_bytes=200000 vs the schema's 120000 →
  // AI_InvalidToolInputError surfaced raw in the bubble). Clamp instead of
  // erroring the turn.
  if (toolCall.toolName === "webFetch") {
    try {
      const input =
        typeof toolCall.input === "string"
          ? JSON.parse(toolCall.input)
          : (toolCall.input ?? {});
      const mb = (input as { max_bytes?: unknown }).max_bytes;
      if (typeof mb === "number" && mb > 120_000) {
        return {
          ...toolCall,
          input: JSON.stringify({ ...input, max_bytes: 120_000 }),
        };
      }
      // Unparseable / no over-cap value → nothing to repair.
    } catch {
      return null;
    }
    return null;
  }
  // Schema-shaped repairs: the model emitted a valid tool name but invalid
  // arguments. The SDK re-validates a repaired call, so these turn a failed
  // tool call into a successful one instead of an error card.
  const schemaRepair = SCHEMA_REPAIRS[toolCall.toolName];
  if (schemaRepair) {
    const parsed =
      typeof toolCall.input === "string"
        ? (() => {
            try {
              return JSON.parse(toolCall.input);
            } catch {
              return null;
            }
          })()
        : (toolCall.input ?? {});
    if (parsed === null) return null;
    const repaired = schemaRepair(parsed);
    if (!repaired) return null;
    return { ...toolCall, input: JSON.stringify(repaired) };
  }
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
