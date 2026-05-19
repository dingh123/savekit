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
      exclude: [
        'src/types.ts',
        'src/index.ts',
        // Legacy browser-compat fallbacks that happy-dom cannot exercise.
        // The code MUST remain for real-world IE/Edge/老 Safari/WebView 用户
        // (see FileSaver.js parity requirement), but excluding from coverage
        // stats lets us hold the rest of the codebase to a high standard.
        'src/strategies/ms-save-blob.ts',
        'src/dom.ts',
      ],
      // Current baseline after excluding the legacy-fallback files above.
      // Raise these as `save.ts` integration tests and FSA abort/error paths
      // get more coverage. Long-term target: lines/statements 80, branches 75.
      thresholds: {
        lines: 77,
        branches: 73,
        functions: 90,
        statements: 77,
      },
    },
  },
});
