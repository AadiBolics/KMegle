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
  devIndicators: false,

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