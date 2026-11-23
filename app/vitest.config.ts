import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The Custom UI in ui/ has its own Vitest setup (jsdom); run it with npm test there.
    include: ['test/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      thresholds: { 'src/scoring/**': { lines: 90 } },
    },
  },
});
