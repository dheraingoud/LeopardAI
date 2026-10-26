import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";
import { branchPickerPreviousDisabled } from "../../store/primitive-predicates";

export const useBranchPickerPrevious = () => {
  const leopard = useLeopard();
  const disabled = useLeopardState(branchPickerPreviousDisabled);

  const previous = useCallback(() => {
    leopard.message.switchToBranch({ position: "previous" });
  }, [leopard]);

  return { previous, disabled };
};
