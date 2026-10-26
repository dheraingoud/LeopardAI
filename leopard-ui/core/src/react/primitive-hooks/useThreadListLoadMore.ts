import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";
import { threadListLoadMoreDisabled } from "../../store/primitive-predicates";

export const useThreadListLoadMore = () => {
  const leopard = useLeopard();
  const disabled = useLeopardState(threadListLoadMoreDisabled);

  const loadMore = useCallback(() => {
    leopard.threads.loadMore();
  }, [leopard]);

  return { loadMore, disabled };
};
