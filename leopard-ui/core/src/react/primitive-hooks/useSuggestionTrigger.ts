import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";
import {
  suggestionSendMode,
  suggestionTriggerDisabled,
} from "../../store/primitive-predicates";

export type UseSuggestionTriggerOptions = {
  prompt: string;
  send?: boolean | undefined;
  clearComposer?: boolean | undefined;
};

export const useSuggestionTrigger = ({
  prompt,
  send,
  clearComposer = true,
}: UseSuggestionTriggerOptions) => {
  const leopard = useLeopard();
  const resolvedSend = send ?? false;
  const disabled = useLeopardState((s) =>
    suggestionTriggerDisabled(s, resolvedSend),
  );

  const trigger = useCallback(() => {
    if (resolvedSend) {
      const mode = suggestionSendMode(leopard.thread.getState());
      if (mode === "blocked") return;

      leopard.thread.append({
        content: [{ type: "text", text: prompt }],
        runConfig: leopard.composer.getState().runConfig,
      });
      // A queued send must not clear the draft the user is still composing.
      if (clearComposer && mode === "now") {
        leopard.composer.setText("");
      }
    } else {
      if (clearComposer) {
        leopard.composer.setText(prompt);
      } else {
        const currentText = leopard.composer.getState().text;
        leopard.composer.setText(
          [currentText, prompt].filter((part) => part.trim()).join(" "),
        );
      }
    }
  }, [leopard, resolvedSend, clearComposer, prompt]);

  return { trigger, disabled };
};
