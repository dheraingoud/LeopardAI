import {
  useLeopard,
  useLeopardState,
  useToolArgsStatus,
  type Toolkit,
} from "@/leopard-ui/react-native";
import { useCallback, useEffect, type ReactNode } from "react";
import type { ModelContextSource } from "../../leopard-ui/modelContext";
import type {
  ToolkitDisplay,
  ToolkitExecution,
  WidgetToolkitExtension,
} from "../../leopard-ui/extension";
import type { Catalog } from "../catalog";
import { SpecRenderer } from "../react/native";
import { specToolkitFor, type SpecToolkitOptions } from "./toolkit";

function useMessages() {
  return useLeopardState((s) => s.thread.messages);
}

function useArgsComplete() {
  return useToolArgsStatus().argsStatus === "complete";
}

function Frame({
  children,
}: {
  title: string;
  streaming: boolean;
  children: ReactNode;
}) {
  return children;
}

/** The React Native spec toolkit, whose entries go into `Tools({ toolkit })` from `@/leopard-ui/react-native`. */
export type NativeSpecToolkit = Omit<WidgetToolkitExtension, "entries"> & {
  entries(context: {
    execution: ToolkitExecution;
    display: ToolkitDisplay;
  }): Toolkit;
};

function useSendMessage() {
  const leopard = useLeopard();
  return useCallback((text: string) => leopard.thread.append(text), [leopard]);
}

function useModelContext(source: ModelContextSource) {
  const leopard = useLeopard();
  useEffect(
    () =>
      leopard.modelContext.register({
        getModelContext: () => {
          const system = source.read();
          return system ? { system } : {};
        },
        subscribe: source.subscribe,
      }),
    [leopard, source],
  );
}

const build = specToolkitFor({
  useMessages,
  useArgsComplete,
  SpecRenderer,
  Frame,
  useSendMessage,
  useModelContext,
});

/**
 * Spec mode for `@/leopard-ui/react-native`: `render_spec`, which streams
 * patches into a React Native `SpecRenderer` with your components. Pass
 * `entries({ execution, display })` to `Tools({ toolkit })`, and give the
 * model the guidance of the `spec` module in `modules`.
 */
export function createSpecToolkit(
  catalog: Catalog,
  options: SpecToolkitOptions,
): NativeSpecToolkit {
  const extension = build(catalog, options);
  return {
    ...extension,
    entries: (context) => extension.entries(context) as Toolkit,
  };
}
