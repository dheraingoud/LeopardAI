import type { FC, PropsWithChildren } from "react";
import { useLeopard, LeopardConfig, LeopardProvider, Derived } from "@/leopard-ui/store";

export const MessageByIndexProvider: FC<
  PropsWithChildren<{
    index: number;
  }>
> = ({ index, children }) => {
  const leopard = useLeopard();
  const config = LeopardConfig({
    message: Derived({
      source: "thread",
      query: { type: "index", index },
      get: (leopard) => leopard.thread.message({ index }),
    }),
    composer: Derived({
      source: "message",
      query: {},
      get: (leopard) => leopard.thread.message({ index }).composer(),
    }),
  });
  return (
    <LeopardProvider extends={leopard} config={config}>
      {children}
    </LeopardProvider>
  );
};
