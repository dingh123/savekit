import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/types.ts', 'src/index.ts'],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 90,
        statements: 80,
      },
    },
  },
});
