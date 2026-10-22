import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // Keep the PostgreSQL driver a plain Node.js package (it is also in Next's default list) so the
  // standalone output ships it and scripts/*.mjs can import it from the production image.
  serverExternalPackages: ["pg", "exceljs", "pdfkit"],
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
