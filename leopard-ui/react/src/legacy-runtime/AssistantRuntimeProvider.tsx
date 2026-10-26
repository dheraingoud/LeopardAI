"use client";

import { type FC, memo, type PropsWithChildren, useEffect } from "react";
import {
  type AssistantClient,
  type LeopardConfig,
  useLeopard,
} from "@/leopard-ui/store";
import type { AssistantRuntime } from "@/leopard-ui/core";
import { AssistantProviderBase } from "@/leopard-ui/core/react";
import { ThreadPrimitiveViewportProvider } from "../context/providers/ThreadViewportProvider";
import { DevToolsProviderApi } from "../devtools/DevToolsHooks";

export namespace AssistantRuntimeProvider {
  export type Props = PropsWithChildren<{
    /**
     * The assistant runtime to expose to descendants. Build one with
     * `useLocalRuntime`, `useExternalStoreRuntime`, or
     * `useAssistantTransportRuntime`.
     */
    runtime: AssistantRuntime;

    /**
     * Optional parent `AssistantClient` whose scopes are inherited by the
     * client created for this runtime. Use this when nesting an
     * `AssistantRuntimeProvider` inside another assistant context. Omit this
     * prop when there is no parent client.
     * @defaultValue undefined
     */
    leopard?: AssistantClient;

    /**
     * Optional extra scopes provided alongside the runtime's `threads`
     * scope; build with `LeopardConfig`.
     */
    config?: LeopardConfig;
  }>;
}

const DevToolsRegistration: FC = () => {
  const leopard = useLeopard();
  useEffect(() => {
    if (typeof process === "undefined" || process.env.NODE_ENV === "production")
      return;
    return DevToolsProviderApi.register(leopard);
  }, [leopard]);
  return null;
};

export const AssistantRuntimeProviderImpl: FC<
  AssistantRuntimeProvider.Props
> = ({ children, leopard, config, runtime }) => {
  return (
    <AssistantProviderBase runtime={runtime} leopard={leopard ?? null} config={config}>
      <DevToolsRegistration />
      {/* TODO temporarily allow accessing viewport state from outside the viewport */}
      {/* TODO figure out if this behavior should be deprecated, since it is quite hacky */}
      <ThreadPrimitiveViewportProvider>
        {children}
      </ThreadPrimitiveViewportProvider>
    </AssistantProviderBase>
  );
};

export const AssistantRuntimeProvider = memo(AssistantRuntimeProviderImpl);
