import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";
import { actionBarReloadDisabled } from "../../store/primitive-predicates";

export const useActionBarReload = () => {
  const leopard = useLeopard();
  const disabled = useLeopardState(actionBarReloadDisabled);

  const reload = useCallback(() => {
    leopard.message.reload();
  }, [leopard]);

  return { reload, disabled };
};
