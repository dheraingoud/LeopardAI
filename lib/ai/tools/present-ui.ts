// presentUI — the generative-UI composition tool. The model emits a tree of
// composable components the client renders as one styled surface.

import { jsonSchema, tool } from "ai";
import { leopardUiTreeSchema } from "@/lib/ai/generative-ui-schema";
import { generativeUiNode } from "@/lib/ai/generative-ui-tree";

const presentUiResult = (args: unknown): string => {
  const node = generativeUiNode(args);
  const root =
    node && typeof node === "object"
      ? String((node as Record<string, unknown>)._type ?? "component")
      : "component";
  return (
    `Rendered the ${root} surface. It is now visible in the chat. Do not call ` +
    `presentUI again for this surface — reply to the user in text instead.`
  );
};

export function presentUI() {
  return tool({
    description:
      "Present a composed UI to the user. Build a tree of components: the root " +
      "node selects a component with `_type` and provides its props inline; " +
      "nest more nodes with `children`, and wrap several nodes in one layout " +
      "component so they share a surface. Use it when the answer is a " +
      "laid-out interface — a summary card, a set of headline figures, a " +
      "tabbed breakdown, a step list, an alert with supporting detail. For a " +
      "single chart, table, or diagram use renderWidget instead.",
    inputSchema: jsonSchema(leopardUiTreeSchema()),
    execute: async (args) => presentUiResult(args),
  });
}
