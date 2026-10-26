import { useCallback } from "react";
import { useLeopard } from "@/leopard-ui/store";

export const useEditComposerCancel = () => {
  const leopard = useLeopard();

  const cancel = useCallback(() => {
    leopard.composer.cancel();
  }, [leopard]);

  return { cancel };
};
