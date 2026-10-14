import { useAuiState } from "@/aui/store";
import type { MessageState } from "../../store/scopes/message";

export const useThreadMessages = (): readonly MessageState[] => {
  return useAuiState((s) => s.thread.messages);
};
