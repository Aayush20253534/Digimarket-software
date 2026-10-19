import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@digimarket/contracts"],
  reactStrictMode: true,
};

export default nextConfig;
