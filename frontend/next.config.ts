import type { NextConfig } from "next";

// Server-side env var (not exposed to the browser).
// Set this to https://kmegle-backend.onrender.com on Vercel.
// Locally it defaults to http://localhost:5000.
const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://kmegle-backend.onrender.com"
    : "http://localhost:5000");

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone build (with a pruned
  // node_modules) for a slim, multi-stage Docker runtime image.
  output: "standalone",

  devIndicators: false,

  // Empty turbopack config — required to silence the warning when no turbopack
  // customisation is needed (Next.js 16+ uses Turbopack by default).
  // Web Workers created via `new Worker(new URL(..., import.meta.url))` are
  // supported natively in Turbopack with no additional configuration.
  turbopack: {},

  async rewrites() {
    return [
      // Proxy Socket.IO traffic through Vercel so the browser
      // never makes requests directly to onrender.com.
      {
        source: "/socket.io/:path*",
        destination: `${BACKEND_URL}/socket.io/:path*`,
      },
      // Proxy all backend REST API calls (TURN credentials, etc.)
      {
        source: "/api/backend/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
