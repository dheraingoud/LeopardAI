import { useCallback } from "react";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";

type StateUpdater<TState> = TState | ((prev: TState) => TState);

/**
 * Reads and writes the state of a registered interactable.
 *
 * Pair with {@link useAssistantInteractable} which handles registration.
 *
 * @deprecated Since 2026-06-14 — migrate to the Unstable / Experimental API.
 * Scheduled for removal on/after 2026-09-14. See
 * {@link https://www.assistant-ui.com/docs/tools/interactables#migrating-from-the-previous-api | Interactables migration guide}.
 */
export const useInteractableState = <TState>(
  id: string,
  fallback: TState,
): [
  TState,
  {
    setState: (updater: StateUpdater<TState>) => void;
    setSelected: (selected: boolean) => void;
    isPending: boolean;
    error: unknown;
    flush: () => Promise<void>;
  },
] => {
  const leopard = useLeopard();

  const state =
    (useLeopardState((s) => s.interactables.definitions[id]?.state) as TState) ??
    (fallback as TState);

  const persistenceStatus = useLeopardState((s) => s.interactables.persistence[id]);

  const setState = useCallback(
    (updater: StateUpdater<TState>) => {
      leopard.interactables.setState(id, (prev) => {
        if (typeof updater === "function") {
          return (updater as (prev: TState) => TState)(prev as TState);
        }
        return updater;
      });
    },
    [leopard, id],
  );

  const setSelected = useCallback(
    (selected: boolean) => {
      leopard.interactables.setSelected(id, selected);
    },
    [leopard, id],
  );

  const flush = useCallback(() => leopard.interactables.flush(), [leopard]);

  return [
    state,
    {
      setState,
      setSelected,
      isPending: persistenceStatus?.isPending ?? false,
      error: persistenceStatus?.error,
      flush,
    },
  ];
};
