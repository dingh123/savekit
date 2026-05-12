import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  treeshake: true,
  sourcemap: true,
  clean: true,
  minify: false,
  target: 'es2022',
  outDir: 'dist',
  outExtension: ({ format }) => ({
    js: format === 'esm' ? '.js' : '.cjs',
  }),
});
