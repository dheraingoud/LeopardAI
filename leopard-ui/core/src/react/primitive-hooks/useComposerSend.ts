import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";
import { composerSendDisabled } from "../../store/primitive-predicates";
import type { ComposerSendOptions } from "../../store/scopes/composer";

export const useComposerSend = () => {
  const leopard = useLeopard();
  const disabled = useLeopardState(composerSendDisabled);

  const send = useCallback(
    (opts?: ComposerSendOptions) => {
      leopard.composer.send(opts);
    },
    [leopard],
  );

  return { send, disabled };
};
