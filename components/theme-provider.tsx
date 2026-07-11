"use client";

/**
 * ThemeProvider — leopard's no-flash theme provider. Replaces `next-themes`
 * (Phase 7 mechanism) to clear the React 19 / Next 16 dev warning
 * "Encountered a script tag while rendering React component".
 *
 * Why not next-themes: 0.4.6 (latest) renders its no-flash `ThemeScript` as a
 * raw `<script dangerouslySetInnerHTML>` inside the client tree. Next 16 /
 * React 19.2 logs the warning above for raw client-rendered inline scripts,
 * and there is no prop to opt out — upstream bug (#385/#387, fix PR #386 still
 * open). The PR's approach is "don't render ThemeScript on client": we go one
 * step further and own the whole mechanism so zero raw `<script>` is rendered
 * in the React tree.
 *
 * Mechanism (functionally identical to what next-themes gave us):
 *  - No-flash SSR: the no-flash script runs via `next/script` with
 *    `strategy="beforeInteractive"` placed in the SERVER root layout
 *    (`app/layout.tsx` — see "leopard-theme-init"). Next hoists it into the
 *    document header, so it sets the `dark`/`light` class on `<html>` BEFORE
 *    React hydrates → no theme flash on first paint. `next/script` is Next's
 *    sanctioned path, so it does NOT trip the React 19 script warning.
 *  - Client state: `useTheme()` returns `{theme, setTheme, resolvedTheme,
 *    themes}`. `theme` defaults to "dark" until the mount effect reads the
 *    class the beforeInteractive script already set on `<html>` — mirrors
 *    next-themes' own "undefined until mount" behavior, so Clerk/Toaster
 *    (which coerce undefined→dark) behave identically.
 *  - Persistence: `localStorage["leopard-theme"]` (same key as before, so
 *    existing users keep their preference across the swap). No OS-pref sniff
 *    (`enableSystem=false` equivalent) — dark is the default.
 *
 * `useLeopardTheme()` (below) exposes `toggleTheme`, which adds the
 * `theme-transitioning` class for 420ms to drive the smooth 350ms fade in
 * `globals.css` (`html.theme-transitioning *`) — replicates the prior Zustand
 * `applyThemeToDOM` transition verbatim so the toggle feel is preserved.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type LeopardTheme = "dark" | "light";

const STORAGE_KEY = "leopard-theme";
const DEFAULT_THEME: LeopardTheme = "dark";
const VALID_THEMES: LeopardTheme[] = ["dark", "light"];

type ThemeContextValue = {
  /** Active theme ("dark" pre-resolution; resolved from <html> on mount). */
  theme: LeopardTheme;
  setTheme: (t: LeopardTheme) => void;
  /** Same as `theme` (no system resolution) — kept for next-themes compat. */
  resolvedTheme: LeopardTheme;
  themes: LeopardTheme[];
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readActiveClass(): LeopardTheme {
  if (typeof document === "undefined") return DEFAULT_THEME;
  return document.documentElement.classList.contains("light")
    ? "light"
    : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // SSR + first client render: dark (leopard default). The mount effect below
  // syncs to whatever the beforeInteractive script already set on <html>.
  const [theme, setThemeState] = useState<LeopardTheme>(DEFAULT_THEME);

  useEffect(() => {
    setThemeState(readActiveClass());
  }, []);

  const setTheme = useCallback((next: LeopardTheme) => {
    if (!VALID_THEMES.includes(next)) return;
    setThemeState(next);
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(next);
    root.style.colorScheme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode / storage disabled — DOM class still applied above.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme: theme,
      themes: VALID_THEMES,
    }),
    [theme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * next-themes-shaped `useTheme` for consumers that read the active theme
 * (`theme-toaster`, `dynamic-clerk-provider`). Returns a dark default before
 * the provider resolves on mount, same as next-themes did.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  return {
    theme: DEFAULT_THEME,
    setTheme: () => {},
    resolvedTheme: DEFAULT_THEME,
    themes: VALID_THEMES,
  };
}

let transitionTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Leopard-flavored hook — `{ theme, toggleTheme }` (the shape the sidebar
 * buttons consume). `toggleTheme` adds the `theme-transitioning` class for
 * 420ms to drive the smooth 350ms transitions in globals.css (replicates the
 * prior Zustand store's applyThemeToDOM).
 */
export function useLeopardTheme(): {
  theme: LeopardTheme;
  toggleTheme: () => void;
} {
  const { theme, setTheme } = useTheme();
  const current: LeopardTheme = theme === "light" ? "light" : "dark";

  const toggleTheme = () => {
    const next: LeopardTheme = current === "dark" ? "light" : "dark";
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      // Smooth-fade class drives the 350ms transitions in globals.css. Remove
      // after 420ms so the class doesn't interfere with other animations.
      root.classList.add("theme-transitioning");
      if (transitionTimeout) clearTimeout(transitionTimeout);
      transitionTimeout = setTimeout(() => {
        root.classList.remove("theme-transitioning");
        transitionTimeout = null;
      }, 420);
    }
    setTheme(next);
  };

  return { theme: current, toggleTheme };
}
