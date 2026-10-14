"use client";

import type { FC, PropsWithChildren } from "react";
import { useAui, AuiConfig, AuiProvider } from "@/aui/store";
import {
  type ThreadMessageClientProps,
  ThreadMessageClient,
} from "@/aui/core/store";

export const MessageProvider: FC<
  PropsWithChildren<ThreadMessageClientProps>
> = ({ children, ...props }) => {
  const aui = useAui();
  const config = AuiConfig({ message: ThreadMessageClient(props) });
  return (
    <AuiProvider extends={aui} config={config}>
      {children}
    </AuiProvider>
  );
};
