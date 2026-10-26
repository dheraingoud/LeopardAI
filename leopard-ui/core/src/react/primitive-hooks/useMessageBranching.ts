import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";

export const useMessageBranching = () => {
  const leopard = useLeopard();
  const branchNumber = useLeopardState((s) => s.message.branchNumber);
  const branchCount = useLeopardState((s) => s.message.branchCount);

  const goToPrev = useCallback(() => {
    leopard.message.switchToBranch({ position: "previous" });
  }, [leopard]);

  const goToNext = useCallback(() => {
    leopard.message.switchToBranch({ position: "next" });
  }, [leopard]);

  return { branchNumber, branchCount, goToPrev, goToNext };
};
