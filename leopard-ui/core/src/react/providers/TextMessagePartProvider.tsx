import { type FC, type PropsWithChildren, useMemo } from "react";
import {
  useLeopard,
  LeopardConfig,
  LeopardProvider,
  type ClientOutput,
} from "@/leopard-ui/store";
import type { PartState } from "../../store/scopes/part";

import { resource } from "@/leopard-ui/tap";

const useTextMessagePartClient = ({
  text,
  isRunning,
}: {
  text: string;
  isRunning: boolean;
}): ClientOutput<"part"> => {
  const state = useMemo<PartState>(
    () => ({
      type: "text",
      text,
      status: isRunning ? { type: "running" } : { type: "complete" },
    }),
    [text, isRunning],
  );

  return {
    getState: () => state,
    addToolResult: () => {
      throw new Error("Not supported");
    },
    resumeToolCall: () => {
      throw new Error("Not supported");
    },
    respondToToolApproval: () => {
      throw new Error("Not supported");
    },
    unstable_recordInteraction: async () => {
      throw new Error("Not supported");
    },
  };
};

const TextMessagePartClient = resource(useTextMessagePartClient);

export const TextMessagePartProvider: FC<
  PropsWithChildren<{
    text: string;
    isRunning?: boolean;
  }>
> = ({ text, isRunning = false, children }) => {
  const leopard = useLeopard();
  const config = LeopardConfig({
    part: TextMessagePartClient({ text, isRunning }),
  });
  return (
    <LeopardProvider extends={leopard} config={config}>
      {children}
    </LeopardProvider>
  );
};
