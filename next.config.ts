import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // Photos are resized on the phone to roughly 300-600KB each. Vercel rejects bodies over 4.5MB.
      bodySizeLimit: "4mb",
    },
  },
  turbopack: {
    rules: {
      // Only the Tailwind entrypoint needs this loader. CSS modules must retain module exports.
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
