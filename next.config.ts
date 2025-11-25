import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000", 
        "*.whop.com", 
        "*.apps.whop.com",
        "*.vercel.app",
        "whop.com"
      ],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*", // Allow all origins for now to fix the handshake
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "X-Requested-With, Content-Type, Authorization",
          },
          {
            // Critical for iframes: Allows the app to be embedded
            key: "Content-Security-Policy",
            value: "frame-ancestors https://*.whop.com https://whop.com;",
          }
        ],
      },
    ];
  },
};

export default nextConfig;
