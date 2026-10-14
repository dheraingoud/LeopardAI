import { useCallback } from "react";
import { useAui } from "@/aui/store";

export const useThreadListItemTrigger = () => {
  const aui = useAui();

  const switchTo = useCallback(() => {
    aui.threadListItem.switchTo();
  }, [aui]);

  return { switchTo };
};
