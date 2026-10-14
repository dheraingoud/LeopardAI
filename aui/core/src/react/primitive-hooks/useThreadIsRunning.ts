import { useAuiState } from "@/aui/store";

/**
 * @deprecated Use `useAuiState((s) => s.thread.isRunning)` instead.
 */
export const useThreadIsRunning = (): boolean => {
  return useAuiState((s) => s.thread.isRunning);
};
