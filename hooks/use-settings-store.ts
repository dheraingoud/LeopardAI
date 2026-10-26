"use client";

/**
 * User interaction prefs (not account config — those live in Convex users).
 * Persisted in Convex (`userPrefs.sendWithEnter` / `userPrefs.webFetchEnabled`)
 * so they survive a reload and follow the account; read by both the Settings
 * page and the composer.
 */
import { create } from "zustand";
import { getPrefsSnapshot, subscribePrefs, writePrefs } from "@/lib/prefs-cache";

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

export const useSettingsStore = create<SettingsState>()((set) => ({
  sendWithEnter: true,
  setSendWithEnter: (v) => {
    set({ sendWithEnter: v });
    writePrefs({ sendWithEnter: v });
  },
  webFetchEnabled: true,
  setWebFetchEnabled: (v) => {
    set({ webFetchEnabled: v });
    writePrefs({ webFetchEnabled: v });
  },
}));

subscribePrefs(() => {
  const { sendWithEnter, webFetchEnabled } = getPrefsSnapshot();
  useSettingsStore.setState({
    ...(sendWithEnter === undefined ? {} : { sendWithEnter }),
    ...(webFetchEnabled === undefined ? {} : { webFetchEnabled }),
  });
});
