/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output keeps the production bundle small enough for the VPS.
  output: "standalone",
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
