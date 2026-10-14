import { useCallback } from "react";
import { useAui } from "@/aui/store";

export const useThreadListItemArchive = () => {
  const aui = useAui();

  const archive = useCallback(() => {
    aui.threadListItem.archive();
  }, [aui]);

  return { archive };
};
