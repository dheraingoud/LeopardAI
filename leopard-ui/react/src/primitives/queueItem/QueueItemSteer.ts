"use client";

import {
  type ActionButtonElement,
  type ActionButtonProps,
  createActionButton,
} from "../../utils/createActionButton";
import { useLeopard } from "@/leopard-ui/store";
import { useCallback } from "react";

const useQueueItemSteer = () => {
  const leopard = useLeopard();

  const callback = useCallback(() => {
    leopard.queueItem.steer();
  }, [leopard]);

  return callback;
};

export namespace QueueItemPrimitiveSteer {
  export type Element = ActionButtonElement;
  export type Props = ActionButtonProps<typeof useQueueItemSteer>;
}

/**
 * A button that steers the current run to process this queue item immediately.
 *
 * @example
 * ```tsx
 * <QueueItemPrimitive.Steer>Run Now</QueueItemPrimitive.Steer>
 * ```
 */
export const QueueItemPrimitiveSteer = createActionButton(
  "QueueItemPrimitive.Steer",
  useQueueItemSteer,
);
