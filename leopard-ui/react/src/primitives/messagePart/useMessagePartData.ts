"use client";

import type { DataMessagePart } from "@/leopard-ui/core";
import { useLeopardState } from "@/leopard-ui/store";

/**
 * @deprecated Use {@link useLeopardState} to select and narrow `s.part`.
 * Return `null` for optional rendering. Do not throw inside the selector:
 * selectors run inside `useSyncExternalStore`'s `getSnapshot`, so a transient
 * part mismatch during thread switches can unmount the React root.
 *
 * @example
 * ```tsx
 * const part = useLeopardState((s) =>
 *   s.part.type === "data" && (!name || s.part.name === name)
 *     ? s.part
 *     : null,
 * );
 * ```
 *
 * See the {@link https://assistant-ui.com/docs/migrations/v0-12 migration guide}.
 */
export const useMessagePartData = <T = any>(name?: string) => {
  const part = useLeopardState((s) => {
    if (s.part.type !== "data") {
      return null;
    }
    return s.part as DataMessagePart<T>;
  });

  if (!part) {
    return null;
  }

  if (name && part.name !== name) {
    return null;
  }

  return part;
};
