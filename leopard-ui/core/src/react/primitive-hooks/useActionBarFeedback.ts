import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";

export const useActionBarFeedbackPositive = () => {
  const leopard = useLeopard();
  const isSubmitted = useLeopardState(
    (s) => s.message.metadata.submittedFeedback?.type === "positive",
  );

  const submit = useCallback(() => {
    leopard.message.submitFeedback({ type: "positive" });
  }, [leopard]);

  return { submit, isSubmitted };
};

export const useActionBarFeedbackNegative = () => {
  const leopard = useLeopard();
  const isSubmitted = useLeopardState(
    (s) => s.message.metadata.submittedFeedback?.type === "negative",
  );

  const submit = useCallback(() => {
    leopard.message.submitFeedback({ type: "negative" });
  }, [leopard]);

  return { submit, isSubmitted };
};
