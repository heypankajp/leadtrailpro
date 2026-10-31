import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  experimental: {
    agentUpgrade: "security",
  },
  // Keep these plain Node.js packages out of the server bundle so the standalone output ships them under
  // node_modules and scripts/*.mjs (migrations, db-check, mail-test) can import them from the production image.
  serverExternalPackages: ["pg", "exceljs", "pdfkit", "nodemailer"],
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
