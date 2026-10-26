import { useEffect } from "react";
import { useLeopard } from "@/leopard-ui/store";
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
  const leopard = useLeopard();

  useEffect(() => {
    if (disabled) return;

    const config = {
      system: instruction,
    };
    return leopard.modelContext.register({
      getModelContext: () => config,
    });
  }, [leopard, instruction, disabled]);
};
