"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/components/theme-provider";

export function ThemeToaster() {
  const { theme } = useTheme();
  // Theme resolves on mount; default to dark pre-mount (leopard default).
  const resolved = theme === "light" ? "light" : "dark";
  const isDark = resolved === "dark";

  return (
    <Toaster
      theme={resolved}
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
