/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@imposter/game", "@imposter/net", "@imposter/ui"],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
