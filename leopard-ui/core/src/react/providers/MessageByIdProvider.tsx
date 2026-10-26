import type { FC, PropsWithChildren } from "react";
import { useLeopard, LeopardConfig, LeopardProvider, Derived } from "@/leopard-ui/store";

export const MessageByIdProvider: FC<
  PropsWithChildren<{
    id: string;
  }>
> = ({ id, children }) => {
  const leopard = useLeopard();
  const config = LeopardConfig({
    message: Derived({
      source: "thread",
      query: { type: "id", id },
      get: (leopard) => leopard.thread.message({ id }),
    }),
    composer: Derived({
      source: "message",
      query: {},
      get: (leopard) => leopard.thread.message({ id }).composer(),
    }),
  });
  return (
    <LeopardProvider extends={leopard} config={config}>
      {children}
    </LeopardProvider>
  );
};
