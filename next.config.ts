import type { NextConfig } from "next";

// A second dev server on port 3001 gets its own build dir: the dev lock and
// the compiled artifacts live under <distDir>/dev, so the primary server on
// 3000 keeps its .next untouched. The port comes from argv because
// process.env.PORT is set after this config is evaluated.
const argv = process.argv;
const portEq = argv.find((a) => a.startsWith("--port="));
const portFlag = argv.findIndex((a) => a === "-p" || a === "--port");
const devPort = portEq
  ? portEq.slice("--port=".length)
  : portFlag !== -1 && argv[portFlag + 1]
    ? argv[portFlag + 1]
    : (process.env.PORT ?? "");

const nextConfig: NextConfig = {
  // Devtools overlay renders a large dark disc over the page in headless
  // Chromium (poisons every visual sweep). Not leopard UI — kill it.
  devIndicators: false,
  distDir: devPort === "3001" ? ".next-dev3001" : ".next",
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
