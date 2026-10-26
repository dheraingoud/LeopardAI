import { useLeopardState } from "@/leopard-ui/store";

/**
 * @deprecated Use `useLeopardState((s) => s.thread.isEmpty)` instead.
 */
export const useThreadIsEmpty = (): boolean => {
  return useLeopardState((s) => s.thread.isEmpty);
};
