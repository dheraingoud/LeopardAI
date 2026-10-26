import type { AssistantClient } from "@/leopard-ui/store";
import type { ThreadListItemMethods } from "../../store/scopes/thread-list-item";

export type KeyedThreadListItem = Pick<
  ThreadListItemMethods,
  "getState" | "initialize"
>;

export const tryGetKeyedThreadListItem = (
  leopard: AssistantClient,
): KeyedThreadListItem | undefined => {
  const live = leopard.threadListItem;
  if (!live.source) return undefined;
  const id = live.getState().id;
  if (id === undefined) return undefined;
  // A body can resolve before the list's committed items include its
  // thread; the live item is already the per-thread anchor in that window.
  const listed = leopard.threads
    .getState()
    .threadItems.some((item) => item.id === id || item.remoteId === id);
  return listed ? leopard.threads.item({ id }) : live;
};
