# savekit

> A modern browser-side file saving library · TypeScript · zero deps · ESM-first · tree-shakeable

[![npm version](https://img.shields.io/npm/v/savekit.svg?style=flat-square)](https://www.npmjs.com/package/savekit)
[![CI](https://img.shields.io/github/actions/workflow/status/dingh123/savekit/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/dingh123/savekit/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlephobia/minzip/savekit?style=flat-square&label=min%2Bgzip)](https://bundlephobia.com/package/savekit)
[![license](https://img.shields.io/npm/l/savekit.svg?style=flat-square)](./LICENSE)

### 🎮 [Live Demo → https://dingh123.github.io/savekit/](https://dingh123.github.io/savekit/) · [中文文档](./README.md)

---

`savekit` is a modern rewrite of the classic [`FileSaver.js`](https://github.com/eligrey/FileSaver.js). It drops legacy compatibility shims (IE, old Edge, ancient iOS WebView) and adds:

- ✅ First-class TypeScript types
- ✅ Promise **and** callback APIs (`onStart` / `onProgress` / `onSuccess` / `onError` / `onAbort`)
- ✅ Download progress for remote URLs
- ✅ Cancellable via `AbortSignal`
- ✅ File System Access API (real "Save As" dialog + streaming writes on Chromium 89+)
- ✅ Many input types: `Blob | File | ArrayBuffer | ArrayBufferView | ReadableStream | string | { url }`
- ✅ Zero dependencies, zero side effects, ESM + CJS dual output

## Install

```bash
pnpm add savekit
```

## Quick start

```ts
import { save } from 'savekit';

await save('hello, world', { filename: 'hello.txt' });

await save(
  { url: 'https://example.com/big.zip' },
  {
    filename: 'big.zip',
    onProgress: (e) => {
      if (e.phase === 'downloading' && e.total) {
        console.log(`${((e.loaded / e.total) * 100).toFixed(1)}%`);
      }
    },
  },
);
```

See the [Chinese README](./README.md) for the full API reference, callback contract, and migration guide.

## License

MIT — inspired by Eli Grey's `FileSaver.js`.
