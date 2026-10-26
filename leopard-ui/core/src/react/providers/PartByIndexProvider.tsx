import type { FC, PropsWithChildren } from "react";
import { useLeopard, LeopardConfig, LeopardProvider, Derived } from "@/leopard-ui/store";

export const PartByIndexProvider: FC<
  PropsWithChildren<{
    index: number;
  }>
> = ({ index, children }) => {
  const leopard = useLeopard();
  const config = LeopardConfig({
    part: Derived({
      source: "message",
      query: { type: "index", index },
      get: (leopard) => leopard.message.part({ index }),
    }),
  });
  return (
    <LeopardProvider extends={leopard} config={config}>
      {children}
    </LeopardProvider>
  );
};
