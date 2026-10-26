"use client";

import type { FC } from "react";
import { useLeopardState } from "@/leopard-ui/store";

export namespace AttachmentPrimitiveName {
  export type Props = Record<string, never>;
}

export const AttachmentPrimitiveName: FC<
  AttachmentPrimitiveName.Props
> = () => {
  const name = useLeopardState((s) => s.attachment.name);
  return <>{name}</>;
};

AttachmentPrimitiveName.displayName = "AttachmentPrimitive.Name";
