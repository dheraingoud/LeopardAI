"use client";

import type { FC, PropsWithChildren } from "react";
import { useLeopardState } from "@/leopard-ui/store";

export namespace ThreadPrimitiveEmpty {
  export type Props = PropsWithChildren;
}

/**
 * @deprecated Use `<LeopardIf condition={(s) => s.thread.isEmpty} />` instead.
 */
export const ThreadPrimitiveEmpty: FC<ThreadPrimitiveEmpty.Props> = ({
  children,
}) => {
  const empty = useLeopardState((s) => s.thread.isEmpty);
  return empty ? children : null;
};

ThreadPrimitiveEmpty.displayName = "ThreadPrimitive.Empty";
