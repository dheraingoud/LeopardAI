"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useThemeStore } from "@/store/themeStore";

const DARK_APPEARANCE = {
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
  elements: {
    card: "glass-intense !border-white/[0.08]",
    socialButtonsBlockButton:
      "!bg-white/[0.03] !border-white/[0.08] hover:!bg-white/[0.06] !text-[#d4d4d4]",
    formButtonPrimary:
      "!bg-[#ffb400] !text-black hover:!bg-[#e6a300] !font-mono",
    footerActionLink: "!text-[#ffb400]",
    headerTitle: "!text-white !font-mono",
    headerSubtitle: "!text-[#525252] !font-mono",
    identityPreviewText: "!text-[#a3a3a3]",
    formFieldLabel: "!text-[#737373] !font-mono !text-xs",
    formFieldInput:
      "!bg-white/[0.03] !border-white/[0.06] !text-white !font-mono",
    dividerLine: "!bg-white/[0.06]",
    dividerText: "!text-[#404040]",
  },
} as const;

const LIGHT_APPEARANCE = {
  baseTheme: undefined,
  variables: {
    colorPrimary: "#d49600",
    colorBackground: "#fdf6e3",
    colorText: "#171717",
    colorInputBackground: "rgba(0,0,0,0.02)",
    colorInputText: "#171717",
    borderRadius: "0.75rem",
    fontFamily: '"Instrument Sans", "Bricolage Grotesque", sans-serif',
  },
  elements: {
    card: "glass-intense !border-black/[0.08]",
    socialButtonsBlockButton:
      "!bg-black/[0.02] !border-black/[0.08] hover:!bg-black/[0.04] !text-[#404040]",
    formButtonPrimary:
      "!bg-[#d49600] !text-white hover:!bg-[#b37e00] !font-mono",
    footerActionLink: "!text-[#d49600]",
    headerTitle: "!text-[#171717] !font-mono",
    headerSubtitle: "!text-[#8c8c8c] !font-mono",
    identityPreviewText: "!text-[#525252]",
    formFieldLabel: "!text-[#737373] !font-mono !text-xs",
    formFieldInput:
      "!bg-black/[0.02] !border-black/[0.06] !text-[#171717] !font-mono",
    dividerLine: "!bg-black/[0.04]",
    dividerText: "!text-[#a3a3a3]",
  },
} as const;

export function DynamicClerkProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme } = useThemeStore();
  const appearance = theme === "light" ? LIGHT_APPEARANCE : DARK_APPEARANCE;

  return (
    <ClerkProvider
      appearance={appearance as any}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInForceRedirectUrl="/app"
      signUpForceRedirectUrl="/app"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
