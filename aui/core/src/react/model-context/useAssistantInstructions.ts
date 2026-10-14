import { useEffect } from "react";
import { useAui } from "@/aui/store";
import type { AssistantInstructionsConfig } from "../..";

export type { AssistantInstructionsConfig };

const getInstructions = (
  instruction: string | AssistantInstructionsConfig,
): AssistantInstructionsConfig => {
  if (typeof instruction === "string") return { instruction };
  return instruction;
};

export const useAssistantInstructions = (
  config: string | AssistantInstructionsConfig,
) => {
  const { instruction, disabled = false } = getInstructions(config);
  const aui = useAui();

  useEffect(() => {
    if (disabled) return;

    const config = {
      system: instruction,
    };
    return aui.modelContext.register({
      getModelContext: () => config,
    });
  }, [aui, instruction, disabled]);
};
