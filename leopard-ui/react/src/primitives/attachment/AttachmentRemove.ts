"use client";

import {
  type ActionButtonElement,
  type ActionButtonProps,
  createActionButton,
} from "../../utils/createActionButton";
import { useCallback } from "react";
import { useLeopard } from "@/leopard-ui/store";

const useAttachmentRemove = () => {
  const leopard = useLeopard();

  const handleRemoveAttachment = useCallback(() => {
    leopard.attachment.remove();
  }, [leopard]);

  return handleRemoveAttachment;
};

export namespace AttachmentPrimitiveRemove {
  export type Element = ActionButtonElement;
  export type Props = ActionButtonProps<typeof useAttachmentRemove>;
}

export const AttachmentPrimitiveRemove = createActionButton(
  "AttachmentPrimitive.Remove",
  useAttachmentRemove,
);
