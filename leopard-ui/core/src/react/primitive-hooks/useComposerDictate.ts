import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";

export const useComposerDictate = () => {
  const leopard = useLeopard();
  const disabled = useLeopardState(
    (s) =>
      s.thread.isDisabled ||
      s.composer.dictation != null ||
      !s.thread.capabilities.dictation ||
      !s.composer.isEditing,
  );

  const startDictation = useCallback(() => {
    leopard.composer.startDictation();
  }, [leopard]);

  return { startDictation, disabled };
};
