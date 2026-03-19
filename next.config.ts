import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
    proxyClientMaxBodySize: 20 * 1024 * 1024,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "xthnopypqfacguofvnkx.supabase.co" },
    ],
  },
  async redirects() {
    // 루트 접속 시 인트로 대신 홈으로 리다이렉트
    return [{ source: "/", destination: "/home", permanent: false }];
  },
  // Turbopack 명시 (Next.js 16 기본값)
  turbopack: {},
};

export default nextConfig;
