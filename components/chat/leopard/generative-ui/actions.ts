// Generative-UI action dispatch. An interactive component (Button, Select,
// Input, Checkbox, Slider, DatePicker, RadioGroup, CheckboxGroup, Form) fires
// its `_action` payload through `$dispatch`. Leopard hands that payload back to
// the model as the next user turn, so the surface the model painted drives the
// conversation it belongs to.

import type { Action } from "@/aui/generative-ui/ir";

export type GenerativeUIActionSender = (action: Action) => void;

export function actionToUserTurn(action: Action): string {
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(action)) {
    if (key === "type" || key === "$input") continue;
    details[key] = value;
  }
  const lines = [
    "The user interacted with the interface you rendered.",
    `Action: ${action.type}`,
  ];
  if (Object.keys(details).length > 0) {
    lines.push(`Details: ${JSON.stringify(details)}`);
  }
  const input = action["$input"];
  if (input !== undefined) {
    lines.push(`Input: ${JSON.stringify(input)}`);
  }
  return lines.join("\n");
}

export function createLeopardDispatch(
  send: GenerativeUIActionSender,
): (action: Action) => void {
  return (action) => {
    if (typeof action?.type !== "string" || action.type.length === 0) {
      console.warn(
        "[leopard] generative-UI action has no `type` — the payload was dropped.",
      );
      return;
    }
    send(action);
  };
}
