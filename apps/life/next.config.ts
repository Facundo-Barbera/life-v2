import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev assets/HMR when opened through Tailscale Serve.
  allowedDevOrigins: ["bixku-focaltec.snakebird-cardassian.ts.net"],
};

export default nextConfig;
