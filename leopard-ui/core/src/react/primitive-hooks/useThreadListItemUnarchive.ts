import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";
import { threadListItemUnarchiveDisabled } from "../../store/primitive-predicates";

export const useThreadListItemUnarchive = () => {
  const leopard = useLeopard();
  const disabled = useLeopardState(threadListItemUnarchiveDisabled);

  const unarchive = useCallback(() => {
    leopard.threadListItem.unarchive();
  }, [leopard]);

  return { unarchive, disabled };
};
