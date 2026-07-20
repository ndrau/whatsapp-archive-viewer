import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kleineres Docker-Image: nur benötigte Server-Dateien.
  output: "standalone",
  // Dev und Production teilen sich standardmäßig .next.
  // Parallele next build + next dev Läufe führen zu korrupten Webpack-Chunks.
  // Deshalb blockt scripts/next-build-safe.mjs Builds, solange Port 3000 belegt ist.
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
};

export default nextConfig;
