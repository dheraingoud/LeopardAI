import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";

export const useMessageReload = () => {
  const leopard = useLeopard();
  const canReload = useLeopardState((s) => s.message.role === "assistant");

  const reload = useCallback(() => {
    leopard.message.reload();
  }, [leopard]);

  return { reload, canReload };
};
