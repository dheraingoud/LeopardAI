import { useCallback } from "react";
import { useAui, useAuiState } from "@/aui/store";
import { threadListItemUnarchiveDisabled } from "../../store/primitive-predicates";

export const useThreadListItemUnarchive = () => {
  const aui = useAui();
  const disabled = useAuiState(threadListItemUnarchiveDisabled);

  const unarchive = useCallback(() => {
    aui.threadListItem.unarchive();
  }, [aui]);

  return { unarchive, disabled };
};
