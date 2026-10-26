import type { FC, PropsWithChildren } from "react";
import { useLeopard, LeopardConfig, LeopardProvider, Derived } from "@/leopard-ui/store";

export const McpServerByIdProvider: FC<PropsWithChildren<{ id: string }>> = ({
  id,
  children,
}) => {
  const leopard = useLeopard();
  const config = LeopardConfig({
    mcpServer: Derived({
      source: "mcp",
      query: { id },
      get: (parent) => parent.mcp.server({ id }),
    }),
  });
  return (
    <LeopardProvider extends={leopard} config={config}>
      {children}
    </LeopardProvider>
  );
};
