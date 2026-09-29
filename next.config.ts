import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

// The desktop app serves the export from the root; the GitHub Pages web version lives under /<repo>.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  // Under a sub-folder, the home page's data file must live at /<repo>/index.txt; without trailing
  // slashes Next.js asks for /<repo>.txt (outside the site) and logs 404s. Apps (no sub-folder) are unaffected.
  trailingSlash: Boolean(basePath),
  // The dev-only "N" badge sits over the sidebar's Log Out button.
  devIndicators: false,
  images: {
    unoptimized: true,
  },
  // Lets the web version name its offline cache after the release (sw.js?v=…).
  env: { NEXT_PUBLIC_APP_VERSION: version },
};

export default nextConfig;
