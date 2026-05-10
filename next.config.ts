import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  output: 'export',
  // Set basePath to your GitHub repo name when deploying to GitHub Pages.
  // Leave empty for Firebase Hosting or custom domain.
  basePath: isProd ? (process.env.NEXT_PUBLIC_BASE_PATH ?? '') : '',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
