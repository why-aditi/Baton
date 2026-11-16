import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      thresholds: { 'src/scoring/**': { lines: 90 } },
    },
  },
});
