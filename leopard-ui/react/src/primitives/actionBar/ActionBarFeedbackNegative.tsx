"use client";

import { forwardRef } from "react";
import type { ActionButtonProps } from "../../utils/createActionButton";
import { composeEventHandlers } from "radix-ui/internal";
import { Primitive } from "../../utils/Primitive";
import { useLeopardState } from "@/leopard-ui/store";
import { useActionBarFeedbackNegative as useActionBarFeedbackNegativeBehavior } from "@/leopard-ui/core/react";

const useActionBarFeedbackNegative = () => {
  const { submit } = useActionBarFeedbackNegativeBehavior();
  return submit;
};

export namespace ActionBarPrimitiveFeedbackNegative {
  export type Element = HTMLButtonElement;
  export type Props = ActionButtonProps<typeof useActionBarFeedbackNegative>;
}

export const ActionBarPrimitiveFeedbackNegative = forwardRef<
  ActionBarPrimitiveFeedbackNegative.Element,
  ActionBarPrimitiveFeedbackNegative.Props
>(({ onClick, disabled, ...props }, forwardedRef) => {
  const isSubmitted = useLeopardState(
    (s) => s.message.metadata.submittedFeedback?.type === "negative",
  );
  const callback = useActionBarFeedbackNegative();
  return (
    <Primitive.button
      type="button"
      aria-pressed={isSubmitted}
      {...(isSubmitted ? { "data-submitted": "true" } : {})}
      {...props}
      ref={forwardedRef}
      disabled={disabled || !callback}
      onClick={composeEventHandlers(onClick, () => {
        callback?.();
      })}
    />
  );
});

ActionBarPrimitiveFeedbackNegative.displayName =
  "ActionBarPrimitive.FeedbackNegative";
