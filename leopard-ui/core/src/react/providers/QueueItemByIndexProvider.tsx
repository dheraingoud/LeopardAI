import type { FC, PropsWithChildren } from "react";
import { useLeopard, LeopardConfig, LeopardProvider, Derived } from "@/leopard-ui/store";

export type QueueItemByIndexProviderProps = PropsWithChildren<{
  index: number;
}>;

export const QueueItemByIndexProvider: FC<QueueItemByIndexProviderProps> = ({
  index,
  children,
}) => {
  const leopard = useLeopard();
  const config = LeopardConfig({
    queueItem: Derived({
      source: "composer",
      query: { type: "index", index },
      get: (leopard) => leopard.composer.queueItem({ index }),
    }),
  });
  return (
    <LeopardProvider extends={leopard} config={config}>
      {children}
    </LeopardProvider>
  );
};
