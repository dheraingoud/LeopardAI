import { useCallback } from "react";
import { useAui, useAuiState } from "@/aui/store";
import { composerCancelDisabled } from "../../store/primitive-predicates";

export const useComposerCancel = () => {
  const aui = useAui();
  const disabled = useAuiState(composerCancelDisabled);

  const cancel = useCallback(() => {
    aui.composer.cancel();
  }, [aui]);

  return { cancel, disabled };
};
