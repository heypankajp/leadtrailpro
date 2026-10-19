import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // Keep the MySQL driver as a plain Node.js package (like pg/mongodb in Next's default list)
  // so the standalone output ships it and scripts/*.mjs can import it from the production image.
  serverExternalPackages: ["mysql2"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
