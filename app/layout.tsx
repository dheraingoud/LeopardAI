import type { Metadata } from "next";
import Script from "next/script";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToaster } from "@/components/theme-toaster";
import { DynamicClerkProvider } from "@/components/dynamic-clerk-provider";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";

const fontHeading = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-bricolage",
  display: "swap",
});

const fontSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument",
  display: "swap",
});

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
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full antialiased ${fontSans.variable} ${fontHeading.variable}`}
      data-scroll-behavior="smooth"
    >
      <head>
        {/* Brand + mono fonts — not self-hosted via next/font, so loaded as
            Google Fonts <link>s. Momo Signature = the leopard brand face
            (.font-signature resolves to a local()-only @font-face, so it
            needs this stylesheet to load at all); Iosevka Charon = mono. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
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
        {/* No-flash theme init. Runs before hydration (beforeInteractive is
            hoisted into the document header by Next) so the correct
            dark/light class is on <html> on first paint. Replaces the raw
            <script> next-themes rendered client-side (which tripped the
            React 19 "script tag while rendering" dev warning). next/script is
            Next's sanctioned loader → no warning. Key mirrors the custom
            ThemeProvider's STORAGE_KEY ("leopard-theme"). */}
        <Script id="leopard-theme-init" strategy="beforeInteractive">
          {`(function(){var d=document.documentElement;d.classList.remove("dark","light");var apply="light";try{var t=localStorage.getItem("leopard-theme");if(t==="dark"){apply="dark";}else if(t==="light"){apply="light";}else if(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches){apply="dark";}}catch(e){}d.classList.add(apply);d.style.colorScheme=apply;})();`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground noise-overlay">
        <ThemeProvider>
          <DynamicClerkProvider>
            <ConvexClientProvider>
              <TooltipProvider delay={200}>{children}</TooltipProvider>
            </ConvexClientProvider>
            <ThemeToaster />
          </DynamicClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
