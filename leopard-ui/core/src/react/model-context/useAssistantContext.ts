import { useEffect, useInsertionEffect, useRef } from "react";
import { useLeopard } from "@/leopard-ui/store";
import type { AssistantContextConfig } from "../..";

export type { AssistantContextConfig };

export const useAssistantContext = (config: AssistantContextConfig) => {
  const { getContext, disabled = false } = config;
  const leopard = useLeopard();
  const getContextRef = useRef(getContext);
  useInsertionEffect(() => {
    getContextRef.current = getContext;
  }, [getContext]);

  useEffect(() => {
    if (disabled) return;

    return leopard.modelContext.register({
      getModelContext: () => ({
        system: getContextRef.current(),
      }),
    });
  }, [leopard, disabled]);
};
