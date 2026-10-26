import { type ReactNode, memo } from "react";
import type { AssistantClient, LeopardConfig } from "@/leopard-ui/store";
import type { AssistantRuntime } from "../runtime/api/assistant-runtime";
import { AssistantProviderBase } from "./AssistantProvider";

/**
 * Mounts an `AssistantRuntime` into the React tree.
 *
 * Accepts the runtime returned by a runtime hook (e.g. `useLocalRuntime`,
 * `useExternalStoreRuntime`, `useAssistantTransportRuntime`). Internally
 * installs an {@link LeopardProvider}, so descendants can use `useLeopard`,
 * `useLeopardState`, `useLeopardEvent`, and the primitives without any
 * additional setup.
 *
 * @example
 * ```tsx
 * function App() {
 *   const runtime = useLocalRuntime(MyModelAdapter);
 *
 *   return (
 *     <AssistantRuntimeProvider runtime={runtime}>
 *       <Thread />
 *     </AssistantRuntimeProvider>
 *   );
 * }
 * ```
 */
export const AssistantRuntimeProvider = memo(
  ({
    runtime,
    leopard,
    config,
    children,
  }: {
    /**
     * The assistant runtime to expose to descendants. Build one with
     * `useLocalRuntime`, `useExternalStoreRuntime`, or
     * `useAssistantTransportRuntime`.
     */
    runtime: AssistantRuntime;
    /**
     * Optional parent `AssistantClient` whose scopes are inherited by the
     * client created for this runtime. Use this when nesting an
     * `AssistantRuntimeProvider` inside another assistant context.
     * @defaultValue null
     */
    leopard?: AssistantClient | null;
    /**
     * Optional extra scopes provided alongside the runtime's `threads`
     * scope; build with `LeopardConfig`.
     */
    config?: LeopardConfig;
    children: ReactNode;
  }) => {
    return (
      <AssistantProviderBase
        runtime={runtime}
        leopard={leopard ?? null}
        config={config}
      >
        {children}
      </AssistantProviderBase>
    );
  },
);
