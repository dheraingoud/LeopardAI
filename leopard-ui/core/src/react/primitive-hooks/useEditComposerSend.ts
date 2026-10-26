import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";

export const useEditComposerSend = () => {
  const leopard = useLeopard();
  const disabled = useLeopardState((s) => s.composer.isEmpty);

  const send = useCallback(() => {
    leopard.composer.send();
  }, [leopard]);

  return { send, disabled };
};
