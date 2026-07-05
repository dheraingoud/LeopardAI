"use client";

import { Toaster } from "sonner";
import { useThemeStore } from "@/store/themeStore";

export function ThemeToaster() {
  const { theme } = useThemeStore();
  const isDark = theme === "dark";

  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      toastOptions={{
        style: {
          background: isDark ? "rgba(17, 17, 17, 0.9)" : "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(20px)",
          border: isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid rgba(0, 0, 0, 0.08)",
          color: isDark ? "#f5f5f5" : "#171717",
          fontFamily: '"Instrument Sans", "Bricolage Grotesque", sans-serif',
        },
      }}
    />
  );
}
