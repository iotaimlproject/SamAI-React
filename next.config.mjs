/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,

  typescript: {
    ignoreBuildErrors: false,
  },

  // Standalone output for Docker/production (uncomment if deploying via Docker)
  // output: 'standalone',

  // Keep trailingSlash false for API routes; adjust if hosting requires it
  trailingSlash: false,

  // Optimize images if hero.png is used via next/image later
  images: {
    formats: ["image/avif", "image/webp"],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
              "script-src-elem 'self' 'unsafe-inline' blob:",
              "worker-src 'self' blob:",
              "child-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' wss://node-dev.iotaiml.dpdns.org wss://api.deepgram.com https://api.deepgram.com",
              "media-src 'self' blob: https://api.deepgram.com",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
            ].join("; "),
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "microphone=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
