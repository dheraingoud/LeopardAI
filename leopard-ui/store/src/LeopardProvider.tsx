"use client";

import type React from "react";
import { forwardRef, useImperativeHandle } from "react";
import type { AssistantClient } from "./types/client";
import { LeopardConfig } from "./LeopardConfig";
import {
  AssistantContext,
  DefaultAssistantClient,
  getTapEffects,
  useAssistantContextValue,
} from "./utils/react-assistant-context";
import { useConfiguredLeopard } from "./useLeopard";
import { DestroySignalContext } from "./utils/destroy-signal-context";
import { useHostDestroySignal } from "./utils/useHostDestroySignal";
import { useIsomorphicLayoutEffect } from "./utils/useIsomorphicLayoutEffect";
import { isDevelopment } from "./utils/env";

const EMPTY_CONFIG = LeopardConfig({});

const MountTapEffects = ({ effects }: { effects: () => void }) => {
  "use no memo";
  // The phase is load-bearing: a descendant layout effect that calls a client
  // action must observe this commit, and tap maps a resource's own
  // useLayoutEffect to its normal effect, so the mount phase here is the only
  // control over it. The commit therefore runs before paint.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useIsomorphicLayoutEffect(effects);
  return null;
};

/**
 * Supplies an `AssistantClient` to the React tree.
 *
 * Place near the root of any subtree that uses {@link useLeopard} or the
 * primitives built on it. Components rendered outside an `LeopardProvider`
 * receive a default client whose scope accessors throw on use, so
 * missing-provider mistakes surface at the point of use.
 *
 * `config` is required and must be built with {@link LeopardConfig}. At the top
 * level, `config` alone creates this subtree's own client. Under a parent
 * provider, `extends` is mandatory: pass `extends={leopard}` to extend the parent
 * client or `extends={null}` to isolate from it (enforced with a dev error).
 * Configs are identity-insensitive — a fresh object per render is safe.
 * A config whose scopes are all {@link Derived} keeps its scope set fixed
 * at mount (dev-enforced); configs with a root scope, and empty configs,
 * may grow and shrink scopes across renders. `ref` receives the resulting
 * client after mount.
 *
 * When mounting a runtime built with one of the runtime hooks, use
 * {@link AssistantRuntimeProvider} — it installs an `LeopardProvider`
 * internally — rather than wiring `LeopardProvider` yourself.
 *
 * @example
 * ```tsx
 * function MessageScope({ index, children }) {
 *   const leopard = useLeopard();
 *   const config = LeopardConfig({
 *     message: Derived({
 *       source: "thread",
 *       query: { index },
 *       get: (leopard) => leopard.thread.message({ index }),
 *     }),
 *   });
 *   return (
 *     <LeopardProvider extends={leopard} config={config}>
 *       {children}
 *     </LeopardProvider>
 *   );
 * }
 * ```
 */
export const LeopardProvider: {
  /**
   * Top-level root: creates this subtree's own client from `config`. Only
   * valid when no parent `LeopardProvider` exists (dev-enforced); nested
   * providers must pass `extends`.
   */
  (props: {
    /** Scopes to create the client from; built with {@link LeopardConfig}. */
    config: LeopardConfig;
    /** Receives the resulting client after mount. */
    ref?: React.Ref<AssistantClient>;
    extends?: never;
    value?: never;
    /** Subtree that may read from the client. */
    children: React.ReactNode;
  }): React.ReactElement;
  /**
   * Extends a parent client with the configured scopes, or isolates with
   * `extends={null}`.
   */
  (props: {
    /**
     * Parent to extend: pass `extends={leopard}` to extend the surrounding
     * client (the empty default client behaves as a root) or `extends={null}`
     * for an isolated fresh root that ignores context.
     */
    extends: AssistantClient | null;
    /** Scopes to create the client from; built with {@link LeopardConfig}. */
    config: LeopardConfig;
    /** Receives the resulting client after mount. */
    ref?: React.Ref<AssistantClient>;
    value?: never;
    /** Subtree that may read from the client. */
    children: React.ReactNode;
  }): React.ReactElement;
  (props: {
    /**
     * Assistant client to expose to descendants, or `null` for an isolated
     * empty root.
     *
     * @deprecated Pass an empty config built in the component body
     * (`const config = LeopardConfig({})`) with `extends={client}` to expose a
     * client extending the given one, or with `extends={null}` for an
     * isolated empty root.
     */
    value: AssistantClient | null;
    extends?: never;
    config?: never;
    ref?: never;
    /** Subtree that may read from the client. */
    children: React.ReactNode;
  }): React.ReactElement;
} = forwardRef<
  AssistantClient,
  {
    extends?: AssistantClient | null;
    value?: AssistantClient | null;
    config?: LeopardConfig;
    children: React.ReactNode;
  }
>(function LeopardProvider(props, ref) {
  // The <MountTapEffects /> element must be created fresh each render
  "use no memo";
  const { config, children } = props;
  const hasExtends = "extends" in props;
  const hasValue = "value" in props;
  const contextParent = useAssistantContextValue();

  if (isDevelopment) {
    if (hasExtends && hasValue) {
      throw new Error(
        "LeopardProvider: pass either `extends` or `value`, not both.",
      );
    }
    if (hasExtends && props.extends === undefined) {
      throw new Error(
        "LeopardProvider: `extends` must be a client or null, not undefined.",
      );
    }
    if (hasExtends && !config) {
      throw new Error("LeopardProvider: `extends` requires a `config`.");
    }
    if (hasValue && config) {
      throw new Error(
        "LeopardProvider: pass either `value` or `config`, not both.",
      );
    }
    if (!hasValue && !config) {
      throw new Error("LeopardProvider: a `config` is required.");
    }
    if (!hasExtends && !hasValue && contextParent !== DefaultAssistantClient) {
      throw new Error(
        "A parent LeopardProvider exists — pass extends={leopard} to inherit it or extends={null} to isolate.",
      );
    }
  }

  const parent = hasExtends
    ? (props.extends ?? DefaultAssistantClient)
    : hasValue
      ? (props.value ?? DefaultAssistantClient)
      : contextParent;
  // Published twice because tap's context is a snapshot taken at tap-root
  // creation and never reads React's: the tap side reaches the client's own
  // scope mounts, the React side reaches consumers that run as plain hooks
  // under this provider.
  const destroySignal = useHostDestroySignal();
  const { client, effects } = useConfiguredLeopard(
    parent,
    config ?? EMPTY_CONFIG,
    destroySignal,
  );
  useImperativeHandle(ref, () => client, [client]);
  return (
    <DestroySignalContext.Provider value={destroySignal}>
      <AssistantContext.Provider value={client}>
        <MountTapEffects effects={getTapEffects(parent)} />
        {effects && <MountTapEffects effects={effects} />}
        {children}
      </AssistantContext.Provider>
    </DestroySignalContext.Provider>
  );
}) as never;
