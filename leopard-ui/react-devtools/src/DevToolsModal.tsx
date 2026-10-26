"use client";

import { lazy, Suspense, type ComponentType } from "react";
import type { DevToolsPanelPlugin } from "./shell/registry";
import type { DevToolsClient } from "./data/types";

export interface DevToolsModalProps {
  /** Extra inspector tabs appended after the builtins. */
  plugins?: DevToolsPanelPlugin[];
  /** Force a theme. Defaults to "system", which follows the host `.dark` class. */
  theme?: "light" | "dark" | "system";
  /** Data source. Defaults to the in-process DevToolsHooks client. */
  client?: DevToolsClient;
}

// NOTE(fork): nodenext casts `import()` of a CJS-kinded module to
// `{ default: module.exports }` (Node interop), but webpack — the actual
// runtime here — honors `__esModule` and yields `{ default: Component }`.
// The cast bridges the model mismatch; runtime behavior is unchanged.
const DevToolsModalImpl = lazy(
  () =>
    import("./DevToolsModalImpl.js") as unknown as Promise<{
      default: ComponentType<DevToolsModalProps>;
    }>,
);

/**
 * Dev-only. In production the body returns null before the lazy panel chunk is
 * ever requested, so the panel and its compiled styles stay out of the
 * production bundle (the dynamic import is also code-split).
 */
export const DevToolsModal = (props: DevToolsModalProps = {}) => {
  if (
    typeof process !== "undefined" &&
    process.env?.NODE_ENV === "production"
  ) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <DevToolsModalImpl {...props} />
    </Suspense>
  );
};
