import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.gethavi.com" }],
        destination: "https://gethavi.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
