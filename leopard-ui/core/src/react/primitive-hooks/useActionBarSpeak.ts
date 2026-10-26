import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";
import { actionBarSpeakDisabled } from "../../store/primitive-predicates";

export const useActionBarSpeak = () => {
  const leopard = useLeopard();

  const disabled = useLeopardState(actionBarSpeakDisabled);

  const speak = useCallback(async () => {
    leopard.message.speak();
  }, [leopard]);

  return { speak, disabled };
};
