import type { Metadata, Viewport } from "next";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ExternalLinksNewTab } from "@/components/external-links";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToaster } from "@/components/theme-toaster";
import { DynamicClerkProvider } from "@/components/dynamic-clerk-provider";
import { MotionConfigProvider } from "@/components/motion-config-provider";
import { api } from "@/convex/_generated/api";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";
import {
  Bricolage_Grotesque,
  Geist,
  Geist_Mono,
  Instrument_Sans,
} from "next/font/google";
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

/* DESIGN.md law: geometric sans (Geist) for all sans text, weight ceiling
   600; Geist Mono for code/technical labels only, weight 400. Geist is the
   structural sans; Instrument Sans / Bricolage remain in the stacks as
   fallbacks (see globals.css font vars). */
const fontGeist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist",
  display: "swap",
});

const fontGeistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-geist-mono",
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

async function resolveServerTheme(
  clerkId: string | null,
): Promise<"dark" | "light"> {
  try {
    if (!clerkId) return "dark";
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    const prefs = await client.query(api.userPrefs.get, { clerkId });
    return prefs?.theme === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId } = await auth();
  const clerkId = userId ?? (BYPASS_CLERK ? DEV_USER_ID : null);
  const theme = await resolveServerTheme(clerkId);
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full antialiased ${theme} ${fontGeist.variable} ${fontGeistMono.variable} ${fontSans.variable} ${fontHeading.variable}`}
      style={{ colorScheme: theme }}
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
        {/* Space Grotesk — DESIGN.md's sanctioned third editorial face; used
            only for the empty-state greeting line (2026-08-31). */}
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600&display=swap"
          rel="stylesheet"
        />
        {/* The theme class is rendered on <html> by the server (resolveServerTheme
            reads the user's Convex preference), so the first paint already has
            the right theme — no client init script, no flash. */}
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground noise-overlay">
        <ThemeProvider clerkId={clerkId}>
          <DynamicClerkProvider>
            <ConvexClientProvider>
              <MotionConfigProvider>
                <TooltipProvider delay={200}>
                  {children}
                  <ExternalLinksNewTab />
                </TooltipProvider>
              </MotionConfigProvider>
            </ConvexClientProvider>
            <ThemeToaster />
          </DynamicClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
