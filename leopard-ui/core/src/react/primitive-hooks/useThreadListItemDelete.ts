import { useCallback } from "react";
import { useLeopard } from "@/leopard-ui/store";

export const useThreadListItemDelete = () => {
  const leopard = useLeopard();

  const deleteThread = useCallback(() => {
    leopard.threadListItem.delete();
  }, [leopard]);

  return { delete: deleteThread };
};
