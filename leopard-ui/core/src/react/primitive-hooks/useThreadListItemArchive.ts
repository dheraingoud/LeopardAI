import { useCallback } from "react";
import { useLeopard } from "@/leopard-ui/store";

export const useThreadListItemArchive = () => {
  const leopard = useLeopard();

  const archive = useCallback(() => {
    leopard.threadListItem.archive();
  }, [leopard]);

  return { archive };
};
