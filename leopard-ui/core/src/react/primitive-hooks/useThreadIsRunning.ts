import { useLeopardState } from "@/leopard-ui/store";

/**
 * @deprecated Use `useLeopardState((s) => s.thread.isRunning)` instead.
 */
export const useThreadIsRunning = (): boolean => {
  return useLeopardState((s) => s.thread.isRunning);
};
