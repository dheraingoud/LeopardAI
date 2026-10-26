import { useLeopard, useLeopardState, useToolArgsStatus } from "@/leopard-ui/react";
import { useCallback, useEffect, type ReactNode } from "react";
import type { ModelContextSource } from "../../leopard-ui/modelContext";
import type { WidgetToolkitExtension } from "../../leopard-ui/extension";
import type { Catalog } from "../catalog";
import { SpecRenderer } from "../react/SpecRenderer";
import { writeClipboard } from "./thread";
import { specToolkitFor, type SpecToolkitOptions } from "./toolkit";

function useMessages() {
  return useLeopardState((s) => s.thread.messages);
}

function useArgsComplete() {
  return useToolArgsStatus().argsStatus === "complete";
}

function Frame({
  title,
  streaming,
  children,
}: {
  title: string;
  streaming: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-gf-spec={title || undefined}
      data-gf-streaming={streaming || undefined}
    >
      {children}
    </div>
  );
}

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
  copyText: writeClipboard,
});

/**
 * Spec mode for `createWidgetToolkit({ spec })`: adds `render_spec`, which
 * streams patches into a `<SpecRenderer>` with your components, and the
 * `spec` module of `read_me`.
 */
export function createSpecToolkit(
  catalog: Catalog,
  options: SpecToolkitOptions,
): WidgetToolkitExtension {
  return build(catalog, options);
}
