"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/store/themeStore";
import { dark } from "@clerk/themes";

export function ThemeSync() {
  const { theme } = useThemeStore();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
  }, [theme]);

  return null;
}

export function clerkThemeAppearance(theme: "dark" | "light") {
  if (theme === "light") {
    return {
      baseTheme: undefined,
      variables: {
        colorPrimary: "#d49600",
        colorBackground: "#ffffff",
        colorText: "#171717",
        colorInputBackground: "rgba(0,0,0,0.03)",
        colorInputText: "#171717",
        borderRadius: "0.75rem",
        fontFamily: '"Instrument Sans", "Bricolage Grotesque", sans-serif',
      },
    };
  }
  return {
    baseTheme: dark,
    variables: {
      colorPrimary: "#ffb400",
      colorBackground: "#0a0a0a",
      colorText: "#f5f5f5",
      colorInputBackground: "rgba(255,255,255,0.03)",
      colorInputText: "#f5f5f5",
      borderRadius: "0.75rem",
      fontFamily: '"Instrument Sans", "Bricolage Grotesque", sans-serif',
    },
  };
}
