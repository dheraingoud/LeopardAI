"use client";

/**
 * User interaction prefs (not account config — those live in Convex users).
 * Persisted to localStorage so Send-with-Enter survives reloads and is read
 * by both the Settings page and the composer. Keyed namespaced `lf:pref:`.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  /** Enter sends; Shift+Enter inserts a newline. When false, the inverse. */
  sendWithEnter: boolean;
  setSendWithEnter: (v: boolean) => void;
  /** Web fetch tool available to the model (user toggle in the composer +
   * menu). Default ON — the route hardcodes availability; this only lets the
   * user retract it per preference. Rides the request body as `webFetch`. */
  webFetchEnabled: boolean;
  setWebFetchEnabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      sendWithEnter: true,
      setSendWithEnter: (v) => set({ sendWithEnter: v }),
      webFetchEnabled: true,
      setWebFetchEnabled: (v) => set({ webFetchEnabled: v }),
    }),
    { name: "lf:pref" },
  ),
);