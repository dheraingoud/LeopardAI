import { create } from "zustand";
import { persist } from "zustand/middleware";

type AppTheme = "dark" | "light";

interface ThemeState {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
  toggleTheme: () => void;
}

let transitionTimeout: ReturnType<typeof setTimeout> | null = null;

function applyThemeToDOM(theme: AppTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Add transitioning class to trigger smooth CSS transitions
  root.classList.add("theme-transitioning");

  // Clear any pending timeout from a rapid toggle
  if (transitionTimeout) clearTimeout(transitionTimeout);

  // Swap the theme class
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;

  // Remove transition class after animation completes to avoid
  // interfering with other component animations
  transitionTimeout = setTimeout(() => {
    root.classList.remove("theme-transitioning");
    transitionTimeout = null;
  }, 420);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      setTheme: (theme) => {
        applyThemeToDOM(theme);
        set({ theme });
      },
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        applyThemeToDOM(next);
        set({ theme: next });
      },
    }),
    {
      name: "leopard-theme",
      onRehydrateStorage: () => (state) => {
        if (state) {
          // On rehydrate, apply instantly without transition
          if (typeof document !== "undefined") {
            const root = document.documentElement;
            root.classList.remove("dark", "light");
            root.classList.add(state.theme);
            root.setAttribute("data-theme", state.theme);
            root.style.colorScheme = state.theme;
          }
        }
      },
    }
  )
);
