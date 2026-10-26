import type { FC, PropsWithChildren } from "react";
import { useLeopardState } from "@/leopard-ui/store";

export namespace MessagePartPrimitiveInProgress {
  export type Props = PropsWithChildren;
}

export const MessagePartPrimitiveInProgress: FC<
  MessagePartPrimitiveInProgress.Props
> = ({ children }) => {
  const isInProgress = useLeopardState((s) => s.part.status.type === "running");
  return isInProgress ? children : null;
};

MessagePartPrimitiveInProgress.displayName = "MessagePartPrimitive.InProgress";
