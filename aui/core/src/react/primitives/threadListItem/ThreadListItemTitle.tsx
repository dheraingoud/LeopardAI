import type { FC, ReactNode } from "react";
import { useAuiState } from "@/aui/store";

export namespace ThreadListItemPrimitiveTitle {
  export type Props = {
    fallback?: ReactNode;
  };
}

export const ThreadListItemPrimitiveTitle: FC<
  ThreadListItemPrimitiveTitle.Props
> = ({ fallback }) => {
  const title = useAuiState((s) => s.threadListItem.title);
  return <>{title || fallback}</>;
};

ThreadListItemPrimitiveTitle.displayName = "ThreadListItemPrimitive.Title";
