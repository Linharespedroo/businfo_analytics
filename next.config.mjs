/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isProd ? basePath : '',
  assetPrefix: isProd && basePath ? `${basePath}/` : undefined,
  env: {
    NEXT_PUBLIC_DATA_BASE: `${isProd ? basePath : ''}/data`,
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'echarts', 'echarts-for-react'],
  },
};

export default nextConfig;
