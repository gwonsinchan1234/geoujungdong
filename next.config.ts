import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async redirects() {
    return [{ source: "/", destination: "/intro", permanent: false }];
  },
};

export default nextConfig;
