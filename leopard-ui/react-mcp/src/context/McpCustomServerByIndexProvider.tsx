import type { FC, PropsWithChildren } from "react";
import { useLeopard, LeopardConfig, LeopardProvider, Derived } from "@/leopard-ui/store";

export const McpCustomServerByIndexProvider: FC<
  PropsWithChildren<{ index: number }>
> = ({ index, children }) => {
  const leopard = useLeopard();
  const config = LeopardConfig({
    mcpServer: Derived({
      source: "mcp",
      query: { kind: "custom", index },
      get: (parent) => parent.mcp.customServer({ index }),
    }),
  });
  return (
    <LeopardProvider extends={leopard} config={config}>
      {children}
    </LeopardProvider>
  );
};
