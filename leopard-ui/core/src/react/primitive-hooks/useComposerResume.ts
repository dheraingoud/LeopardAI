import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";
import { composerResumeDisabled } from "../../store/primitive-predicates";
import { reportRunFailure } from "../../utils/report-run-failure";

export const useComposerResume = () => {
  const leopard = useLeopard();
  const disabled = useLeopardState(composerResumeDisabled);

  const resume = useCallback(() => {
    reportRunFailure(
      "Resume",
      leopard.thread().resumeRun({
        parentId: leopard.thread().getState().messages.at(-1)?.id ?? null,
      }),
    );
  }, [leopard]);

  return { resume, disabled };
};
