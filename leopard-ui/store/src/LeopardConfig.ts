import type { ClientNames, ClientElement } from "./types/client";
import type { DerivedElement } from "./Derived";

declare const leopardConfigBrand: unique symbol;

export type LeopardConfig = LeopardConfig.Input & {
  readonly [leopardConfigBrand]: true;
};

export declare namespace LeopardConfig {
  type Input = {
    [K in ClientNames]?: ClientElement<K> | DerivedElement<K>;
  };
}

/**
 * Builds a config for {@link LeopardProvider}; the `config` prop only accepts
 * configs built with this helper.
 *
 * A config is plain data: it can be hoisted to module scope, created inline
 * per render, or memoized — the provider never relies on config identity.
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
export const LeopardConfig = (config: LeopardConfig.Input): LeopardConfig =>
  config as LeopardConfig;
