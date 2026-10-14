import { useCallback } from "react";
import { useAui } from "@/aui/store";

export const useEditComposerCancel = () => {
  const aui = useAui();

  const cancel = useCallback(() => {
    aui.composer.cancel();
  }, [aui]);

  return { cancel };
};
