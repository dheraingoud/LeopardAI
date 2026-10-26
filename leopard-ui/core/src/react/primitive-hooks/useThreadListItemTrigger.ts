import { useCallback } from "react";
import { useLeopard } from "@/leopard-ui/store";

export const useThreadListItemTrigger = () => {
  const leopard = useLeopard();

  const switchTo = useCallback(() => {
    leopard.threadListItem.switchTo();
  }, [leopard]);

  return { switchTo };
};
