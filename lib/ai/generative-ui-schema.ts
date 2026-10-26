/**
 * Leopard generative UI: the composable component vocabulary the model builds a
 * UI tree from, and the tool schema describing it.
 */

import { buildPresentParameters } from "@/aui/generative-ui/buildPresentParameters";
import { vocabularyDefinitions } from "@/aui/generative-ui/vocabulary/definitions";
import type { JSONSchema7 } from "json-schema";

export const LEOPARD_UI_COMPONENTS = [
  "Card",
  "Row",
  "Col",
  "Box",
  "Spacer",
  "Tabs",
  "Badge",
  "Header",
  "Text",
  "Caption",
  "Divider",
  "Fact",
  "ListView",
  "ListViewItem",
  "Steps",
  "Timeline",
  "Alert",
  "Icon",
  "Citation",
  "Markdown",
  "Button",
  "Select",
  "Input",
  "Checkbox",
] as const;

export type LeopardUIComponent = (typeof LEOPARD_UI_COMPONENTS)[number];

const definitions = vocabularyDefinitions as Record<
  string,
  { description: string; properties: unknown }
>;

export const leopardUiLibrary = Object.fromEntries(
  LEOPARD_UI_COMPONENTS.map((name) => {
    const definition = definitions[name];
    if (!definition) {
      throw new Error(`[leopard] generative-UI component "${name}" is missing`);
    }
    return [name, definition];
  }),
);

function stripDescriptions(value: unknown, inProperties = false): unknown {
  if (Array.isArray(value)) return value.map((entry) => stripDescriptions(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => inProperties || key !== "description")
        .map(([key, entry]) => [
          key,
          stripDescriptions(entry, key === "properties"),
        ]),
    );
  }
  return value;
}

export function leopardUiTreeSchema(): JSONSchema7 {
  const parameters = buildPresentParameters(
    leopardUiLibrary as Parameters<typeof buildPresentParameters>[0],
  );
  const stripped = stripDescriptions(parameters) as JSONSchema7;
  const node = (stripped.$defs?.["node"] ?? {}) as JSONSchema7;
  const properties = { ...(node.properties ?? {}) };
  const typeSchema = {
    type: "string",
    enum: [...LEOPARD_UI_COMPONENTS],
  } as JSONSchema7;
  properties["_type"] = typeSchema;

  const nested = {
    type: "object",
    properties: { _type: typeSchema },
    required: ["_type"],
    additionalProperties: true,
  } as JSONSchema7;

  properties["children"] = {
    anyOf: [
      { type: "string" },
      nested,
      {
        type: "array",
        items: { anyOf: [{ type: "string" }, nested] },
      },
    ],
  } as JSONSchema7;

  return {
    type: "object",
    properties,
    required: ["_type"],
  };
}
