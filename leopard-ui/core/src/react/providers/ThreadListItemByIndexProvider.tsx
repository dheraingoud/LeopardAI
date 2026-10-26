import type { FC, PropsWithChildren } from "react";
import { useLeopard, LeopardConfig, LeopardProvider, Derived } from "@/leopard-ui/store";

export const ThreadListItemByIndexProvider: FC<
  PropsWithChildren<{
    index: number;
    archived: boolean;
  }>
> = ({ index, archived, children }) => {
  const leopard = useLeopard();
  const config = LeopardConfig({
    threadListItem: Derived({
      source: "threads",
      query: { type: "index", index, archived },
      get: (leopard) => leopard.threads.item({ index, archived }),
    }),
  });
  return (
    <LeopardProvider extends={leopard} config={config}>
      {children}
    </LeopardProvider>
  );
};
