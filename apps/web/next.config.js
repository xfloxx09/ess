/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: false },
  /**
   * Dev proxy: browser → same-origin `/api-backend/*` → Nest on 4000.
   * In production set NEXT_PUBLIC_API_BASE to the real API URL and these rewrites are unused.
   */
  async rewrites() {
    return [
      { source: "/api-backend/:path*", destination: "http://127.0.0.1:4000/:path*" },
      { source: "/ws/:path*", destination: "http://127.0.0.1:4000/ws/:path*" },
    ];
  },
  output: "standalone",
};

module.exports = nextConfig;
