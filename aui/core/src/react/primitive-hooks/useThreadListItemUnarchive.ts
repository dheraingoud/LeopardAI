import { useCallback } from "react";
import { useAui } from "@/aui/store";

export const useThreadListItemUnarchive = () => {
  const aui = useAui();

  const unarchive = useCallback(() => {
    aui.threadListItem.unarchive();
  }, [aui]);

  return { unarchive };
};
