import type { FC, PropsWithChildren } from "react";
import { useLeopard, LeopardConfig, LeopardProvider, Derived } from "@/leopard-ui/store";

export const McpConnectorByIndexProvider: FC<
  PropsWithChildren<{ index: number }>
> = ({ index, children }) => {
  const leopard = useLeopard();
  const config = LeopardConfig({
    mcpServer: Derived({
      source: "mcp",
      query: { kind: "connector", index },
      get: (parent) => parent.mcp.connector({ index }),
    }),
  });
  return (
    <LeopardProvider extends={leopard} config={config}>
      {children}
    </LeopardProvider>
  );
};
