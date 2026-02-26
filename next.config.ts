import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
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
  // Turbopack 명시 — webpack config와 충돌 방지 (Next.js 16 기본값)
  turbopack: {},
  webpack(config, { isServer }) {
    // ExcelJS 브라우저 빌드: Node.js 전용 모듈 빈 모듈로 대체 (webpack 빌드용)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        stream: false,
        crypto: false,
        os: false,
        net: false,
        tls: false,
        zlib: false,
      };
    }
    return config;
  },
};

export default nextConfig;
