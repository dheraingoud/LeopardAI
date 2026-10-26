"use client";

import {
  type ActionButtonElement,
  type ActionButtonProps,
  createActionButton,
} from "../../utils/createActionButton";
import { useCallback, useInsertionEffect, useRef } from "react";
import { useLeopard } from "@/leopard-ui/store";
import { useComposerAddAttachment as useComposerAddAttachmentBehavior } from "@/leopard-ui/core/react";

const useComposerAddAttachment = ({
  multiple = true,
}: {
  /** allow selecting multiple files */
  multiple?: boolean | undefined;
} = {}) => {
  const { disabled, addAttachment } = useComposerAddAttachmentBehavior();
  const leopard = useLeopard();
  const scopeGenerationRef = useRef(0);

  useInsertionEffect(
    () => () => {
      scopeGenerationRef.current += 1;
    },
    [leopard.composer, leopard.optional.threadListItem],
  );

  const callback = useCallback(() => {
    const scopeGeneration = scopeGenerationRef.current;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    input.hidden = true;

    const attachmentAccept = leopard.composer.getState().attachmentAccept;
    if (attachmentAccept !== "*") {
      input.accept = attachmentAccept;
    }

    document.body.appendChild(input);

    input.onchange = async (e) => {
      const fileList = (e.target as HTMLInputElement).files;
      if (!fileList) return;

      const attachmentPromises = Array.from(fileList, async (file) => {
        try {
          if (scopeGenerationRef.current !== scopeGeneration) return;
          await addAttachment(file);
        } catch {
          // The composer runtime emits composer.attachmentAddError before rejecting.
        }
      });

      document.body.removeChild(input);
      await Promise.all(attachmentPromises);
    };

    input.oncancel = () => {
      if (!input.files || input.files.length === 0) {
        document.body.removeChild(input);
      }
    };

    input.click();
  }, [leopard, multiple, addAttachment]);

  if (disabled) return null;
  return callback;
};

export namespace ComposerPrimitiveAddAttachment {
  export type Element = ActionButtonElement;
  export type Props = ActionButtonProps<typeof useComposerAddAttachment>;
}

export const ComposerPrimitiveAddAttachment = createActionButton(
  "ComposerPrimitive.AddAttachment",
  useComposerAddAttachment,
  ["multiple"],
);
