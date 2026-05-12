# savekit

> 现代化的浏览器端文件保存库 · TypeScript · 零依赖 · ESM 优先 · Tree-shakeable

[![npm version](https://img.shields.io/npm/v/savekit.svg?style=flat-square)](https://www.npmjs.com/package/savekit)
[![CI](https://img.shields.io/github/actions/workflow/status/dingh123/savekit/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/dingh123/savekit/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlephobia/minzip/savekit?style=flat-square&label=min%2Bgzip)](https://bundlephobia.com/package/savekit)
[![license](https://img.shields.io/npm/l/savekit.svg?style=flat-square)](./LICENSE)

### 🎮 [在线演示 → https://dingh123.github.io/savekit/](https://dingh123.github.io/savekit/) · [English](./README.en.md)

---

`savekit` 是对经典 [`FileSaver.js`](https://github.com/eligrey/FileSaver.js) 的现代重写，针对 2026 年的浏览器环境去掉了 IE / 旧 Edge / 老 iOS WebView 的兼容包袱，并补齐了：

- ✅ **TypeScript 原生类型**，严格模式编译
- ✅ **Promise + 回调**：`await save(...)` 与 `onStart / onProgress / onSuccess / onError / onAbort` 两套 API 并存
- ✅ **下载进度**：远程 URL 拉取过程支持字节级进度回调
- ✅ **可取消**：`AbortSignal` 一键中断下载或写入
- ✅ **File System Access API**：Chromium 89+ 弹出真正的"另存为"对话框，并支持流式写入
- ✅ **多种输入**：`Blob | File | ArrayBuffer | ArrayBufferView | ReadableStream | string | { url }`
- ✅ **零依赖、零副作用**，ESM/CJS 双格式产物

## 安装

```bash
pnpm add savekit
# 或 npm install savekit
# 或 yarn add savekit
```

## 快速上手

```ts
import { save } from 'savekit';

// 1. 保存文本
await save('hello, world', { filename: 'hello.txt' });

// 2. 保存 Blob
const blob = new Blob([JSON.stringify({ a: 1 })], { type: 'application/json' });
await save(blob, { filename: 'data.json' });

// 3. 下载远程文件并保存（带进度）
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

## API

### `save(data, options?)`

```ts
function save(data: SaveData, options?: SaveOptions): Promise<SaveResult>;
```

### `saveAs(data, filename?, options?)`

兼容原 `FileSaver.js` 的签名，便于迁移：

```ts
import { saveAs } from 'savekit';
await saveAs(blob, 'report.pdf');
```

### `SaveData` —— 支持的输入类型

| 类型 | 说明 |
|---|---|
| `Blob` / `File` | 直接保存 |
| `ArrayBuffer` / `ArrayBufferView` | 自动包成 Blob |
| `ReadableStream<Uint8Array>` | 流式保存（File System Access 路径下不中转 Blob） |
| `string` | 当作文本，默认 MIME `text/plain;charset=utf-8` |
| `{ url: string }` | 先下载，再保存；区别于上面的 `string`，避免歧义 |

### `SaveOptions`

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `filename` | `string` | — | 文件名。缺失时根据 URL / MIME 推断；自动清洗 Windows 非法字符 |
| `mimeType` | `string` | — | 覆盖输入自带的 MIME |
| `autoBom` | `boolean` | `false` | 对 UTF-8 文本/XML 注入 BOM（兼容 Excel 等） |
| `signal` | `AbortSignal` | — | 用于取消下载或写入 |
| `preferFilePicker` | `boolean` | `true` | 优先使用 File System Access API 弹"另存为"对话框 |
| `pickerTypes` | `FilePickerAcceptType[]` | — | 传给 `showSaveFilePicker` 的文件类型 |
| `onStart` | `(info) => void` | — | 策略选定、文件名确定后触发一次 |
| `onProgress` | `(event) => void` | — | 下载 / 写入阶段持续触发 |
| `onSuccess` | `(result) => void` | — | 成功时触发一次 |
| `onError` | `(error) => void` | — | 失败（非用户取消）时触发一次 |
| `onAbort` | `() => void` | — | 用户取消 picker 或 `signal.abort()` 时触发一次 |

### `SaveProgressEvent`

```ts
interface SaveProgressEvent {
  loaded: number;
  total?: number;
  phase: 'normalizing' | 'downloading' | 'picking' | 'writing' | 'done';
}
```

### `SaveResult`

```ts
interface SaveResult {
  filename: string;
  bytes: number;
  method: 'file-system-access' | 'anchor-download' | 'data-url';
  aborted: boolean;
  durationMs: number;
}
```

### 回调与 Promise 的关系

回调与 `await` 是并存的：

```ts
try {
  const result = await save(data, {
    onProgress: (e) => updateBar(e),
    onSuccess: (r) => toast.success(`已保存 ${r.filename}`),
    onError: (e) => toast.error(e.message),
    onAbort: () => toast.info('已取消'),
  });
  // result.aborted === false
} catch (err) {
  // err 是 SaveError / SaveAbortError / SaveDownloadError 之一
}
```

终态三选一互斥：要么 `onSuccess`、要么 `onAbort`、要么 `onError`。回调内部抛错不会影响保存流程，会被吞掉并打到 `console.error`。

### 错误类型

```ts
import { SaveError, SaveAbortError, SaveDownloadError } from 'savekit';
```

- `SaveError` —— 基类
- `SaveAbortError extends SaveError` —— 用户取消或 signal 中断；`.reason` 为 `'user' | 'signal'`
- `SaveDownloadError extends SaveError` —— 远程下载失败；`.url`、`.status`

## 保存策略的选择

在浏览器中，`save()` 会按以下优先级选择策略：

1. **`file-system-access`**（推荐）：可用时通过 `window.showSaveFilePicker` 弹出系统级"另存为"对话框，并支持**流式写入**，对大文件友好
2. **`anchor-download`**：`<a download>` + `URL.createObjectURL`，覆盖绝大多数现代浏览器
3. **`data-url`**：`FileReader` + `data:` URL 兜底，主要为 iOS Safari 老版本

返回的 `SaveResult.method` 字段告诉你实际走了哪条路径，便于埋点。

## 从 `file-saver` 迁移

```diff
- import { saveAs } from 'file-saver';
+ import { saveAs } from 'savekit';

  saveAs(blob, 'report.pdf');
```

差异点：

- `saveAs(string)` 在旧库里被当作 URL；本库视为**文本内容**。要下载远程文件请改用 `save({ url }, ...)`。
- `saveAs` 现在返回 Promise，原同步签名同样工作。
- 不再支持 IE / 旧 Edge。

## 浏览器兼容

| 浏览器 | 最低版本 | 走的策略 |
|---|---|---|
| Chrome / Edge | 90+ | file-system-access |
| Firefox | 100+ | anchor-download |
| Safari | 14+ | anchor-download |
| iOS Safari | 13+ | anchor-download / data-url |

Node.js / SSR 环境下 `save()` 会抛 `SaveError('No available save strategy')`，请仅在客户端调用。

## 开发

```bash
pnpm install
pnpm test           # 单测
pnpm typecheck      # tsc --noEmit
pnpm lint           # biome check
pnpm build          # 出 dist/
pnpm playground     # 本地手测页面（在线演示同源代码）
```

## 发版流程

本仓库采用 **tag 触发**的发布模式：日常提交只会跑 CI 与构建演示页，不会发包。需要发版时：

```bash
# 1. 确认 package.json 的 version 是目标版本
# 2. 提交所有改动后，执行：
pnpm release:tag
```

`release:tag` 会读取 `package.json` 的 `version`，创建 `vX.Y.Z` 的带注解 tag 并推送到远端。GitHub Actions 上的 `release.yml` 监听到 tag 后会自动跑完整流水线并以 `--provenance` 方式发布到 npm。

**Playground 演示页**会在每次 push 到 `main` 时由 `deploy-playground.yml` 自动构建并部署到 GitHub Pages。

## 致谢

灵感与原始实现来自 [Eli Grey](https://eligrey.com) 的 [`FileSaver.js`](https://github.com/eligrey/FileSaver.js)（MIT）。

## License

MIT
