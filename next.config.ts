import type { NextConfig } from "next";

// Hosts the development server (next dev) may serve to besides localhost, for example the public domain when a
// machine runs `docker compose up` behind a proxy; the production image (standalone) ignores this. Add more with
// ALLOWED_DEV_ORIGINS=host1,host2 (feedback from the leadtrail.pro deployment, November 5, 2026).
const allowedDevOrigins = ["leadtrail.pro", "www.leadtrail.pro", ...(process.env.ALLOWED_DEV_ORIGINS ?? "").split(",").map((host) => host.trim()).filter(Boolean)];

const nextConfig: NextConfig = {
  allowedDevOrigins,
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
