import type { NextConfig } from 'next';

// Static export: `npm run build` writes plain HTML/CSS/JS to out/, so any static host can serve it.
const config: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default config;
