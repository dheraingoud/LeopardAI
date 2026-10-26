import { useEffect, useInsertionEffect, useRef } from "react";
import { useLeopard } from "@/leopard-ui/store";
import type { Tool } from "leopard-stream";

type LeopardToolOverride<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown,
> = Partial<Tool<TArgs, TResult>>;

type LeopardToolOverrides = Record<string, LeopardToolOverride<any, any>>;

/**
 * Overrides toolkit entries for the current assistant scope.
 *
 * This is intended for dynamic local-state tools whose model-facing contract is
 * declared in a `"use generative"` toolkit file with `execute: stubTool()`, but
 * whose actual executor must close over React state in the mounted component.
 * Keep the override keys stable after mount; dynamic key addition/removal is not
 * currently observed.
 * Overrides are registered at priority 1000, above toolkit defaults. Only one
 * mounted override provider may define a given tool name at a time.
 *
 * @deprecated Experimental since 2026-06-03. Not scheduled for removal; the API may change in any release.
 */
export function useLeopardToolOverrides(overrides: LeopardToolOverrides): void {
  const leopard = useLeopard();
  const overridesRef = useRef(overrides);
  useInsertionEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);

  useEffect(() => {
    return leopard.modelContext.register({
      getModelContext: () => ({
        priority: 1000,
        tools: overridesRef.current as Record<string, Tool<any, any>>,
      }),
    });
  }, [leopard]);
}
