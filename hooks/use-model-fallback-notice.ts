"use client";

/**
 * Notice shown when a message was routed to a different model because the
 * selected one was unreachable.
 *
 * It lives in a store, not in Composer state: the first send of a draft chat
 * routes to /chat/<id>, which remounts the composer (the provider is keyed by
 * chat id), so component state would drop the notice before the user could
 * read it. The store outlives that remount.
 */
import { create } from "zustand";

export type ModelFallback = {
  /** The model the user picked, which did not answer. */
  from: string;
  /** The model the message actually went to. */
  to: string;
};

type FallbackState = {
  fallback: ModelFallback | null;
  show: (fallback: ModelFallback) => void;
  dismiss: () => void;
};

export const useModelFallbackNotice = create<FallbackState>()((set) => ({
  fallback: null,
  show: (fallback) => set({ fallback }),
  dismiss: () => set({ fallback: null }),
}));
