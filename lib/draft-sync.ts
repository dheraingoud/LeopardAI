// Leopard draft sync — the pure conflict rules between the composer buffer and the Convex draft row.
// After hydration the LOCAL buffer is authoritative: a server echo acknowledges a write, it is not an edit, so it must never clobber newer local text.

export type DraftState = {
  value: string;
  hydrated: boolean;
  pending: string | null;
};

export function initialDraftState(): DraftState {
  return { value: "", hydrated: false, pending: null };
}

export function applyServerDraft(
  state: DraftState,
  serverDraft: string | undefined,
): DraftState {
  if (state.hydrated) return state;
  if (state.pending !== null) {
    return { value: state.value, hydrated: true, pending: state.pending };
  }
  return { value: serverDraft ?? "", hydrated: true, pending: null };
}

export function editDraft(state: DraftState, next: string): DraftState {
  return { value: next, hydrated: state.hydrated, pending: next };
}

export function markDraftWritten(
  state: DraftState,
  written: string,
): DraftState {
  if (state.pending !== written) return state;
  return { value: state.value, hydrated: state.hydrated, pending: null };
}
