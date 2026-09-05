import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Devtools overlay renders a large dark disc over the page in headless
  // Chromium (poisons every visual sweep). Not leopard UI — kill it.
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: process.cwd(),
  },
  // Legacy post-login target: Clerk env points users at /app, which predates
  // the /chat route — redirect instead of 404 (2026-09-05 prod 404).
  async redirects() {
    return [
      { source: "/app", destination: "/chat", permanent: false },
      { source: "/app/:path*", destination: "/chat/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
