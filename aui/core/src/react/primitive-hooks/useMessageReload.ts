import { useCallback } from "react";
import { useAui, useAuiState } from "@/aui/store";

export const useMessageReload = () => {
  const aui = useAui();
  const canReload = useAuiState((s) => s.message.role === "assistant");

  const reload = useCallback(() => {
    aui.message.reload();
  }, [aui]);

  return { reload, canReload };
};
