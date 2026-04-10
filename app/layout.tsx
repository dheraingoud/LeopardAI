import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leopard AI",
  description:
    "A high-performance AI chat interface optimized for speed, precision, and clarity. Powered by NVIDIA NIM.",
  keywords: ["AI", "chat", "NVIDIA", "NIM", "Leopard"],
  icons: {
    icon: "/leopard.svg",
    shortcut: "/leopard.svg",
    apple: "/leopard.svg",
  },
  openGraph: {
    title: "Leopard — AI Chat Platform",
    description: "High-performance AI chat powered by NVIDIA NIM.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#ffb400",
          colorBackground: "#0a0a0a",
          colorText: "#f5f5f5",
          colorInputBackground: "rgba(255,255,255,0.03)",
          colorInputText: "#f5f5f5",
          borderRadius: "0.75rem",
          fontFamily: '"Iosevka Charon", monospace',
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
      }}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInForceRedirectUrl="/app"
      signUpForceRedirectUrl="/app"
      afterSignOutUrl="/"
    >
      <html lang="en" className="dark h-full antialiased" data-scroll-behavior="smooth">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin="anonymous"
          />
          {/* Preload critical font for initial render - prevents FOIT */}
          <link
            rel="preload"
            href="https://fonts.gstatic.com/s/iosevka/v33/iosevka-charon-regular.woff2"
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
          <link
            href="https://fonts.googleapis.com/css2?family=Momo+Signature&display=swap"
            rel="stylesheet"
          />
          <link
            href="https://fonts.googleapis.com/css2?family=Iosevka+Charon:ital,wght@0,300;0,400;0,500;0,700;1,300;1,400;1,500;1,700&display=swap"
            rel="stylesheet"
          />
        </head>
        <body className="min-h-full flex flex-col bg-black text-[#f5f5f5] noise-overlay">
          <ConvexClientProvider>
            <TooltipProvider delay={200}>{children}</TooltipProvider>
          </ConvexClientProvider>
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: "rgba(17, 17, 17, 0.9)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                color: "#f5f5f5",
                fontFamily: '"Iosevka Charon", monospace',
              },
            }}
          />
        </body>
      </html>
    </ClerkProvider>
  );
}
