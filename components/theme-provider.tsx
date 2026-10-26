"use client";

/**
 * ThemeProvider — leopard's no-flash theme provider. Owns the theme state and
 * writes it to Convex (`userPrefs.theme`), so the preference follows the
 * account instead of living in one browser.
 *
 * Mechanism:
 *  - No-flash SSR: the SERVER root layout (`app/layout.tsx`) reads the user's
 *    Convex preference and renders the `dark`/`light` class on `<html>`
 *    directly — the correct theme is on the element before the first paint,
 *    with no client init script at all.
 *  - Client state: `useTheme()` returns `{theme, setTheme, resolvedTheme,
 *    themes}`. `theme` defaults to "dark" until the mount effect reads the
 *    class the server already set on `<html>` — so Clerk/Toaster (which coerce
 *    undefined→dark) behave identically.
 *  - Persistence: `userPrefs.theme` in Convex. No OS-pref sniff
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
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export type LeopardTheme = "dark" | "light";

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

export function ThemeProvider({
  children,
  clerkId,
}: {
  children: React.ReactNode;
  clerkId?: string | null;
}) {
  // SSR + first client render: dark (leopard default). The mount effect below
  // syncs to whatever class the server already put on <html>.
  const [theme, setThemeState] = useState<LeopardTheme>(DEFAULT_THEME);

  useEffect(() => {
    setThemeState(readActiveClass());
  }, []);

  const setTheme = useCallback(
    (next: LeopardTheme) => {
      if (!VALID_THEMES.includes(next)) return;
      setThemeState(next);
      if (typeof document === "undefined") return;
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(next);
      root.style.colorScheme = next;
      if (!clerkId) return;
      const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
      void client
        .mutation(api.userPrefs.set, { clerkId, theme: next })
        .catch((err) => {
          console.warn("[theme] persist failed:", err);
        });
    },
    [clerkId],
  );

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
