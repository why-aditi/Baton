import type { NextConfig } from 'next';

// Static export: `npm run build` writes plain HTML/CSS/JS to out/, so any static host can serve it.
const config: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  // GitHub Pages serves the site under /Baton/; the Pages workflow sets BASE_PATH. Local dev stays at /.
  basePath: process.env.BASE_PATH || undefined,
};

export default config;
