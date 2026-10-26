import { useEffect, useInsertionEffect, useMemo, useRef } from "react";
import { resource, useResource } from "@/leopard-ui/tap";
import { useLeopard } from "@/leopard-ui/store";
import {
  createClientFacade,
  useAssistantContextProvider,
} from "@/leopard-ui/store/client";
import { useAssistantClientDestroySignal } from "@/leopard-ui/store/internal";
import { ThreadRuntimeImpl } from "../../../runtime/api/thread-runtime";
import {
  NestedSubscriptionSubject,
  ShallowMemoizeSubject,
} from "../../../subscribable/subscribable";
import { ThreadClient } from "../../../store/runtime-clients/thread-runtime-client";
import type { ClientThreadListRuntimeCore } from "./ClientThreadListRuntimeCore";
import { EMPTY_THREAD_CORE } from "../../../runtimes/remote-thread-list/empty-thread-core";

type ThreadOptions = {
  clientCore: ClientThreadListRuntimeCore;
  threadId?: string | undefined;
  startThread?: boolean | undefined;
};

const useHostedThreadRuntime = ({
  clientCore,
  threadId,
  startThread,
}: Pick<ThreadOptions, "clientCore" | "threadId" | "startThread">) => {
  const leopard = useLeopard();
  const manager = clientCore.hookManager;
  const id = threadId!;
  const destroySignal = useAssistantClientDestroySignal();
  useEffect(() => {
    if (startThread) void manager.startThreadRuntime(id).catch(() => {});
    const stop = () => manager.stopThreadRuntime(id);
    destroySignal?.addEventListener("abort", stop, { once: true });
    return () => destroySignal?.removeEventListener("abort", stop);
  }, [manager, id, destroySignal, startThread]);
  return useMemo(
    () =>
      new ThreadRuntimeImpl(
        new NestedSubscriptionSubject({
          path: {
            ref: `threads[${id}]`,
            threadSelector: { type: "threadId", threadId: id },
          },
          getState: () => manager.getThreadRuntimeCore(id) ?? EMPTY_THREAD_CORE,
          subscribe: (callback) => manager.subscribe(callback),
        }),
        new ShallowMemoizeSubject({
          path: {
            ref: `threadItems[${id}]`,
            threadSelector: { type: "threadId", threadId: id },
          },
          getState: () => ({ ...leopard.threadListItem.getState(), isMain: false }),
          subscribe: leopard.subscribe,
        }),
      ),
    [manager, leopard, id],
  );
};

const useStableClientThreadRuntime = (options: ThreadOptions) => {
  const leopard = useLeopard();
  const leopardRef = useRef(leopard);
  useInsertionEffect(() => {
    leopardRef.current = leopard;
  }, [leopard]);
  const stableLeopard = useMemo(
    () =>
      createClientFacade({
        getClient: () => leopardRef.current,
        subscribe: (listener) => leopardRef.current.subscribe(listener),
      }),
    [],
  );
  return useAssistantContextProvider(stableLeopard, function useHostedRuntime() {
    return useHostedThreadRuntime(options);
  });
};

const useRemoteThreadListRuntimeThread = (options: ThreadOptions) => {
  const runtime = useStableClientThreadRuntime(options);
  return useResource(ThreadClient({ runtime }));
};

export const RemoteThreadListRuntimeThread = resource(
  useRemoteThreadListRuntimeThread,
);
