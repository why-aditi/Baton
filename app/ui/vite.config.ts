import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Forge serves the build from a relative path inside its iframe, so assets must use relative URLs.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'build', emptyOutDir: true },
  test: { environment: 'jsdom', setupFiles: ['src/test-setup.ts'] },
});
