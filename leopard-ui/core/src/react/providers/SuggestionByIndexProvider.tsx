import type { FC, PropsWithChildren } from "react";
import { useLeopard, LeopardConfig, LeopardProvider, Derived } from "@/leopard-ui/store";

export type SuggestionByIndexProviderProps = PropsWithChildren<{
  index: number;
}>;

export const SuggestionByIndexProvider: FC<SuggestionByIndexProviderProps> = ({
  index,
  children,
}) => {
  const leopard = useLeopard();
  const config = LeopardConfig({
    suggestion: Derived({
      source: "suggestions",
      query: { index },
      get: (leopard) => leopard.suggestions.suggestion({ index }),
    }),
  });
  return (
    <LeopardProvider extends={leopard} config={config}>
      {children}
    </LeopardProvider>
  );
};
