import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * The shape of a Metro / Expo config `withLeopard` accepts. Typed loosely so this
 * package needs no hard dependency on `metro` or `expo`; the input shape is
 * preserved and only `transformer.babelTransformerPath` is augmented.
 */
export type MetroConfigLike = {
  /** assistant-ui options, stripped from the config handed back to Metro. */
  leopard?: WithLeopardOptions | undefined;
  transformer?:
    | {
        babelTransformerPath?: string | undefined;
        [key: string]: unknown;
      }
    | undefined;
  [key: string]: unknown;
};

/**
 * Env var the transformer reads to delegate to the project's existing
 * (Expo / React Native) babel transformer. Metro forks its transform workers
 * after `metro.config` is evaluated, so they inherit this value.
 */
export const UPSTREAM_TRANSFORMER_ENV = "LEOPARD_METRO_UPSTREAM_TRANSFORMER";

/**
 * Env var carrying the `backendless` option to the transformer. Metro forks its
 * transform workers after `metro.config` is evaluated, so they inherit it.
 */
export const BACKENDLESS_ENV = "LEOPARD_METRO_BACKENDLESS";

export interface WithLeopardOptions {
  /**
   * The app has no backend importing the server builds of its `"use generative"`
   * modules (e.g. cloud-hosted runs). Frontend/human tool schemas then stay
   * uploadable from the client instead of being assumed backend-known.
   */
  backendless?: boolean;
}

/**
 * Wraps a Metro (or Expo) config so assistant-ui `"use generative"` modules are
 * compiled. Such a file colocates a tool's schema, its `execute`, and its
 * `render` via {@link https://www.assistant-ui.com/docs/tools/defining-tools | defineToolkit}.
 *
 * It points Metro's `babelTransformerPath` at this package's transformer, which
 * runs the `"use generative"` compiler and then delegates to your project's
 * existing transformer. The device (client) build keeps each tool's `render`
 * and any frontend `execute`; a server build (an Expo Router `+api` route)
 * keeps a server `execute` instead.
 *
 * ```js
 * // metro.config.js
 * const { getDefaultConfig } = require("expo/metro-config");
 * const { withLeopard } = require("@leopard-ui/metro");
 *
 * module.exports = withLeopard({
 *   ...getDefaultConfig(__dirname),
 *   leopard: { backendless: true },
 * });
 * ```
 *
 * Authoring is identical to the web: a `"use generative"` file whose default
 * export is `defineToolkit({ ... })`, registered with `Tools({ toolkit })`.
 */
export function withLeopard<T extends MetroConfigLike>(config: T): T {
  const self = require.resolve("@leopard-ui/metro/transformer");
  // Metro validates config keys it does not recognize, so `leopard` must not
  // survive into the returned config.
  const { leopard, ...baseConfig } = config;
  const upstream = config.transformer?.babelTransformerPath;

  // A double-wrap is a re-entry: the first call already captured the real
  // upstream, and replacing it with our transformer would cause recursion.
  // An explicit `leopard` on a rewrap still replaces the backendless setting.
  const isRewrap = upstream === self;

  if (leopard !== undefined || !isRewrap) {
    if (leopard?.backendless) process.env[BACKENDLESS_ENV] = "1";
    else delete process.env[BACKENDLESS_ENV];
  }

  if (!isRewrap) {
    if (upstream) process.env[UPSTREAM_TRANSFORMER_ENV] = upstream;
    else delete process.env[UPSTREAM_TRANSFORMER_ENV];
  }

  return {
    ...baseConfig,
    transformer: {
      ...config.transformer,
      babelTransformerPath: self,
    },
  } as T;
}
