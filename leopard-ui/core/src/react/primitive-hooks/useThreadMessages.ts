import { useLeopardState } from "@/leopard-ui/store";
import type { MessageState } from "../../store/scopes/message";

export const useThreadMessages = (): readonly MessageState[] => {
  return useLeopardState((s) => s.thread.messages);
};
