import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";
import type { CreateAttachment } from "../../types/attachment";

export const useComposerAddAttachment = () => {
  const leopard = useLeopard();
  const disabled = useLeopardState(
    (s) => s.thread.isDisabled || !s.composer.isEditing,
  );

  const addAttachment = useCallback(
    (file: File | CreateAttachment) => {
      return leopard.composer.addAttachment(file);
    },
    [leopard],
  );

  return { addAttachment, disabled };
};
