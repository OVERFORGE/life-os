import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@life-os/execution-kernel", "@life-os/design-system"],
};

export default nextConfig;
