"use client";

import type {
  ActionButtonElement,
  ActionButtonProps,
} from "../../utils/createActionButton";
import { forwardRef } from "react";
import { Primitive } from "../../utils/Primitive";
import { composeEventHandlers } from "radix-ui/internal";
import { useLeopardState } from "@/leopard-ui/store";
import { useThreadListNew as useThreadListNewBehavior } from "@/leopard-ui/core/react";

export namespace ThreadListPrimitiveNew {
  export type Element = ActionButtonElement;
  export type Props = ActionButtonProps<() => void>;
}

export const ThreadListPrimitiveNew = forwardRef<
  ThreadListPrimitiveNew.Element,
  ThreadListPrimitiveNew.Props
>(({ onClick, disabled, ...props }, forwardedRef) => {
  const isMain = useLeopardState(
    (s) => s.threads.newThreadId === s.threads.mainThreadId,
  );

  const { switchToNewThread } = useThreadListNewBehavior();

  return (
    <Primitive.button
      type="button"
      {...(isMain ? { "data-active": "true", "aria-current": "true" } : null)}
      {...props}
      ref={forwardedRef}
      disabled={disabled}
      onClick={composeEventHandlers(onClick, switchToNewThread)}
    />
  );
});

ThreadListPrimitiveNew.displayName = "ThreadListPrimitive.New";
