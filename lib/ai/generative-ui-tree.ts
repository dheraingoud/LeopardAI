/**
 * Extracts the generative-UI node from a presentUI tool call's arguments.
 */

import { fixJson } from "@/lib/fix-json";

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(fixJson(value)[0]);
    } catch {
      return undefined;
    }
  }
}

export function generativeUiNode(input: unknown): unknown {
  const args = parseMaybeJson(input);
  if (!args || typeof args !== "object") return undefined;
  const record = args as Record<string, unknown>;
  if ("_type" in record) return record;
  if ("tree" in record) {
    const tree = parseMaybeJson(record["tree"]);
    if (tree && typeof tree === "object") return tree;
  }
  return undefined;
}
