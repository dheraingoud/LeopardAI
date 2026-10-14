import { useCallback } from "react";
import { useAui } from "@/aui/store";

export const useThreadListItemDelete = () => {
  const aui = useAui();

  const deleteThread = useCallback(() => {
    aui.threadListItem.delete();
  }, [aui]);

  return { delete: deleteThread };
};
