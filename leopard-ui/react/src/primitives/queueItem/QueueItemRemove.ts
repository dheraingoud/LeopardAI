"use client";

import {
  type ActionButtonElement,
  type ActionButtonProps,
  createActionButton,
} from "../../utils/createActionButton";
import { useLeopard } from "@/leopard-ui/store";
import { useCallback } from "react";

const useQueueItemRemove = () => {
  const leopard = useLeopard();

  const callback = useCallback(() => {
    leopard.queueItem.remove();
  }, [leopard]);

  return callback;
};

export namespace QueueItemPrimitiveRemove {
  export type Element = ActionButtonElement;
  export type Props = ActionButtonProps<typeof useQueueItemRemove>;
}

/**
 * A button that removes this item from the queue.
 *
 * @example
 * ```tsx
 * <QueueItemPrimitive.Remove>×</QueueItemPrimitive.Remove>
 * ```
 */
export const QueueItemPrimitiveRemove = createActionButton(
  "QueueItemPrimitive.Remove",
  useQueueItemRemove,
);
