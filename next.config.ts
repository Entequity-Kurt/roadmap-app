import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js uses Node TCP sockets. Keep it out of the webpack bundle.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
