import { useContext, type FC, type PropsWithChildren } from "react";
import { useLeopard, LeopardConfig, LeopardProvider, Derived } from "@/leopard-ui/store";
import { ChainOfThoughtPartsContext } from "./ChainOfThoughtByIndicesProvider";

export const ChainOfThoughtPartByIndexProvider: FC<
  PropsWithChildren<{
    index: number;
  }>
> = ({ index, children }) => {
  const leopard = useLeopard();
  const partsContext = useContext(ChainOfThoughtPartsContext);
  const config = LeopardConfig({
    part: Derived({
      source: "chainOfThought",
      query: { type: "index", index },
      get: (leopard) =>
        partsContext
          ? leopard.message.part({ index: partsContext.startIndex + index })
          : leopard.chainOfThought.part({ index }),
    }),
  });
  return (
    <LeopardProvider extends={leopard} config={config}>
      {children}
    </LeopardProvider>
  );
};
