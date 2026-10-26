import { resource, type ResourceElement } from "@/leopard-ui/tap";
import type {
  AssistantClient,
  ClientNames,
  AssistantClientAccessor,
  ClientMeta,
} from "./types/client";
import { markDerivedHook } from "./utils/derived-hook";
import { useLeopard } from "./useLeopard";
import { useLeopardState } from "./useLeopardState";

type DerivedInstance<K extends ClientNames> = ReturnType<
  AssistantClientAccessor<K>
>;

export const useDerived = <K extends ClientNames>({
  get,
}: Derived.Props<K>): DerivedInstance<K> => {
  const leopard = useLeopard();
  return useLeopardState(() => get(leopard) as DerivedInstance<K>);
};
markDerivedHook(useDerived);

/**
 * Creates a derived client field whose resolved instance is bound into the
 * client returned by `useLeopard`; a structural swap produces a new client through
 * a React re-render. `get` must return a client created via
 * `useClientResource` (or `useClientLookup`/`useClientList`).
 *
 * @example
 * ```tsx
 * const leopard = useLeopard();
 * const config = LeopardConfig({
 *   message: Derived({
 *     source: "thread",
 *     query: { index: 0 },
 *     get: (leopard) => leopard.thread.message({ index: 0 }),
 *   }),
 * });
 *
 * <LeopardProvider extends={leopard} config={config}>{children}</LeopardProvider>;
 * ```
 */
export const Derived = resource(useDerived) as <K extends ClientNames>(
  config: Derived.Props<K>,
) => DerivedElement<K>;

export type DerivedElement<K extends ClientNames> = ResourceElement<
  DerivedInstance<K>
>;

export namespace Derived {
  /**
   * Props passed to a derived client resource element.
   */
  export type Props<K extends ClientNames> = {
    get: (client: AssistantClient) => ReturnType<AssistantClientAccessor<K>>;
  } & ClientMeta<K>;
}
