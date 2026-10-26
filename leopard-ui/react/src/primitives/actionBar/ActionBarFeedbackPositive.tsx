"use client";

import { forwardRef } from "react";
import type { ActionButtonProps } from "../../utils/createActionButton";
import { composeEventHandlers } from "radix-ui/internal";
import { useLeopardState } from "@/leopard-ui/store";
import { Primitive } from "../../utils/Primitive";
import { useActionBarFeedbackPositive as useActionBarFeedbackPositiveBehavior } from "@/leopard-ui/core/react";

const useActionBarFeedbackPositive = () => {
  const { submit } = useActionBarFeedbackPositiveBehavior();
  return submit;
};

export namespace ActionBarPrimitiveFeedbackPositive {
  export type Element = HTMLButtonElement;
  export type Props = ActionButtonProps<typeof useActionBarFeedbackPositive>;
}

export const ActionBarPrimitiveFeedbackPositive = forwardRef<
  ActionBarPrimitiveFeedbackPositive.Element,
  ActionBarPrimitiveFeedbackPositive.Props
>(({ onClick, disabled, ...props }, forwardedRef) => {
  const isSubmitted = useLeopardState(
    (s) => s.message.metadata.submittedFeedback?.type === "positive",
  );
  const callback = useActionBarFeedbackPositive();
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

ActionBarPrimitiveFeedbackPositive.displayName =
  "ActionBarPrimitive.FeedbackPositive";
