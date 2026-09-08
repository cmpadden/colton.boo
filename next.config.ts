import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep development captures free of Next's route indicator.
  devIndicators: false,
  output: "export",
  distDir: process.env.NODE_ENV === "development" ? ".next" : "docs",
  trailingSlash: true,
};

export default nextConfig;
