import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";
import { branchPickerNextDisabled } from "../../store/primitive-predicates";

export const useBranchPickerNext = () => {
  const leopard = useLeopard();
  const disabled = useLeopardState(branchPickerNextDisabled);

  const next = useCallback(() => {
    leopard.message.switchToBranch({ position: "next" });
  }, [leopard]);

  return { next, disabled };
};
