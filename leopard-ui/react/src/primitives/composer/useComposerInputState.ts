"use client";

import { useLeopardState } from "@/leopard-ui/store";
import { useTriggerPopoverActiveAriaOptional } from "./trigger/TriggerPopoverRootContext";

export type TriggerPopoverAriaProps = {
  "aria-controls"?: string;
  "aria-expanded"?: true;
  "aria-haspopup"?: "listbox";
  "aria-activedescendant"?: string | undefined;
};

export function useComposerInputValue() {
  return useLeopardState((s) => (s.composer.isEditing ? s.composer.text : ""));
}

export function useComposerInputDisabled(disabled?: boolean | undefined) {
  const composerDisabled = useLeopardState(
    (s) => s.thread.isDisabled || s.composer.dictation?.inputDisabled,
  );
  return Boolean(composerDisabled) || Boolean(disabled);
}

export function useTriggerPopoverAriaProps(): TriggerPopoverAriaProps {
  const activeAria = useTriggerPopoverActiveAriaOptional();
  if (!activeAria) return {};

  return {
    "aria-controls": activeAria.popoverId,
    "aria-expanded": true,
    "aria-haspopup": "listbox",
    "aria-activedescendant": activeAria.highlightedItemId,
  };
}
