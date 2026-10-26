import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";
import { composerCancelDisabled } from "../../store/primitive-predicates";

export const useComposerCancel = () => {
  const leopard = useLeopard();
  const disabled = useLeopardState(composerCancelDisabled);

  const cancel = useCallback(() => {
    leopard.composer.cancel();
  }, [leopard]);

  return { cancel, disabled };
};
