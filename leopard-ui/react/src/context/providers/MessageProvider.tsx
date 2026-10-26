"use client";

import type { FC, PropsWithChildren } from "react";
import { useLeopard, LeopardConfig, LeopardProvider } from "@/leopard-ui/store";
import {
  type ThreadMessageClientProps,
  ThreadMessageClient,
} from "@/leopard-ui/core/store";

export const MessageProvider: FC<
  PropsWithChildren<ThreadMessageClientProps>
> = ({ children, ...props }) => {
  const leopard = useLeopard();
  const config = LeopardConfig({ message: ThreadMessageClient(props) });
  return (
    <LeopardProvider extends={leopard} config={config}>
      {children}
    </LeopardProvider>
  );
};
