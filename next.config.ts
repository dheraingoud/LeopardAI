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
};

export default nextConfig;
