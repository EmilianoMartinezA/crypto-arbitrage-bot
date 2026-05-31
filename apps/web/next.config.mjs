/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@arbitrage/shared'],
};

export default nextConfig;
