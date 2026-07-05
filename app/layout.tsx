import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { ThemeSync } from "@/components/theme-sync";
import { ThemeToaster } from "@/components/theme-toaster";
import { DynamicClerkProvider } from "@/components/dynamic-clerk-provider";
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
    <html lang="en" suppressHydrationWarning className="dark h-full antialiased" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@10..48,300;10..48,400;10..48,500;10..48,700&family=Instrument+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
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
      <body className="min-h-full flex flex-col bg-background text-foreground noise-overlay">
        <DynamicClerkProvider>
          <ConvexClientProvider>
            <ThemeSync />
            <TooltipProvider delay={200}>{children}</TooltipProvider>
          </ConvexClientProvider>
          <ThemeToaster />
        </DynamicClerkProvider>
      </body>
    </html>
  );
}
