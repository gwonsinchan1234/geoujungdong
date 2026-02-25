import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
    ],
  },
  async redirects() {
    // 루트 접속 시 인트로 대신 홈으로 리다이렉트
    return [{ source: "/", destination: "/home", permanent: false }];
  },
};

export default nextConfig;
