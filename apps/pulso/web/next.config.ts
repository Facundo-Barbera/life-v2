import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@life/tokens", "@life/db", "@life/auth"],
  allowedDevOrigins: ["100.73.20.102", "bixku-focaltec.snakebird-cardassian.ts.net"],
};

export default nextConfig;
