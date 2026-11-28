import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["exceljs"],
  // Local testing only (`npm run dev`): let a phone on the same Wi-Fi load the dev
  // server via the PC's network address (100.x = Tailscale). No effect on the Netlify site.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "100.*.*.*"],
  experimental: {
    // Admins upload the production component list (.xlsx) through a server action.
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
