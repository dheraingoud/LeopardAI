import { useCallback } from "react";
import { useLeopard } from "@/leopard-ui/store";

export const useThreadListNew = () => {
  const leopard = useLeopard();

  const switchToNewThread = useCallback(() => {
    leopard.threads.switchToNewThread();
  }, [leopard]);

  return { switchToNewThread };
};
