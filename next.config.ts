import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  distDir: process.env.NODE_ENV === "development" ? ".next" : "docs",
  trailingSlash: true,
};

export default nextConfig;
