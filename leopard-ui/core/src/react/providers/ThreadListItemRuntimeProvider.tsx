import type { FC, PropsWithChildren } from "react";
import { useLeopard, LeopardConfig, LeopardProvider } from "@/leopard-ui/store";
import type { ThreadListItemRuntime } from "../..";
import { ThreadListItemClient } from "../../store/internal";

export const ThreadListItemRuntimeProvider: FC<
  PropsWithChildren<{
    runtime: ThreadListItemRuntime;
  }>
> = ({ runtime, children }) => {
  const leopard = useLeopard();
  const config = LeopardConfig({
    threadListItem: ThreadListItemClient({ runtime }),
  });
  return (
    <LeopardProvider extends={leopard} config={config}>
      {children}
    </LeopardProvider>
  );
};
