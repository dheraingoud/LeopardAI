import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";

export const useActionBarStopSpeaking = () => {
  const leopard = useLeopard();
  const disabled = useLeopardState((s) => s.message.speech == null);

  const stopSpeaking = useCallback(() => {
    leopard.message.stopSpeaking();
  }, [leopard]);

  return { stopSpeaking, disabled };
};
