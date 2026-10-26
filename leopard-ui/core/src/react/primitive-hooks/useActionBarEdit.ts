import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";
import { actionBarEditDisabled } from "../../store/primitive-predicates";

export const useActionBarEdit = () => {
  const leopard = useLeopard();
  const disabled = useLeopardState(actionBarEditDisabled);

  const edit = useCallback(() => {
    leopard.composer.beginEdit();
  }, [leopard]);

  return { edit, disabled };
};
