import { resource } from "@/leopard-ui/tap";
import type { ClientOutput } from "@/leopard-ui/store";
import type { MessagePartRuntime } from "../../runtime/api/message-part-runtime";
import { useSubscribable } from "./useSubscribable";

const useMessagePartClient = ({
  runtime,
}: {
  runtime: MessagePartRuntime;
}): ClientOutput<"part"> => {
  const state = useSubscribable(runtime);

  return {
    getState: () => state,
    addToolResult: (result) => runtime.addToolResult(result),
    resumeToolCall: (payload) => runtime.resumeToolCall(payload),
    respondToToolApproval: (response) =>
      runtime.respondToToolApproval(response),
    ...(runtime.unstable_recordInteraction && {
      unstable_recordInteraction: (input) =>
        runtime.unstable_recordInteraction!(input),
    }),
    __internal_getRuntime: () => runtime,
  };
};

export const MessagePartClient = resource(useMessagePartClient);
