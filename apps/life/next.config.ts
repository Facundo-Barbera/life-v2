import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev assets/HMR when opened over the tailnet (Tailscale IP / MagicDNS).
  allowedDevOrigins: ["100.73.20.102", "bixku-focaltec.snakebird-cardassian.ts.net"],
};

export default nextConfig;
