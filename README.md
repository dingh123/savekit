# savekit

> 现代化的浏览器端文件保存库 · TypeScript · 零依赖 · ESM 优先 · Tree-shakeable

[![npm version](https://img.shields.io/npm/v/savekit.svg?style=flat-square)](https://www.npmjs.com/package/savekit)
[![CI](https://img.shields.io/github/actions/workflow/status/dingh123/savekit/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/dingh123/savekit/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlephobia/minzip/savekit?style=flat-square&label=min%2Bgzip)](https://bundlephobia.com/package/savekit)
[![license](https://img.shields.io/npm/l/savekit.svg?style=flat-square)](./LICENSE)

### 🎮 [在线演示 → https://dingh123.github.io/savekit/](https://dingh123.github.io/savekit/) · [English](./README.en.md)

---

`savekit` 是对经典 [`FileSaver.js`](https://github.com/eligrey/FileSaver.js) 的 TypeScript 重写：**保存机制与 upstream FileSaver.js 行为对齐**，包括 IE10+ / 旧 Edge 的 `msSaveOrOpenBlob`、跨域无 CORS 的新标签兜底、Safari / Chrome iOS / macOS WebView 的 FileReader 路径等所有边角分支都完整保留；同时补齐了现代化的能力：

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
| `string` | 当作**文本内容**保存，默认 MIME `text/plain;charset=utf-8` |
| `{ url: string }` | URL 下载。同源 URL 与跨域无 CORS 的 URL 不走 fetch，直接交给浏览器（与 FileSaver 一致）；跨域 + CORS 通过的 URL 才会被读取为 Blob 再保存 |

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
  method:
    | 'file-system-access'  // showSaveFilePicker
    | 'anchor-download'     // <a download> + blob URL
    | 'anchor-navigate'     // <a href=url>，URL 字符串源专用（同源 / 无 CORS）
    | 'ms-save-blob'        // navigator.msSaveOrOpenBlob，旧 Edge / IE10+
    | 'data-url';           // FileReader / popup 兜底
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

策略选择与 FileSaver.js 的 Path A/B/C 完全对齐，只在最前面增加了 File System Access 这一首选项。

**对 Blob 类输入**，按以下顺序挑选：

1. **`file-system-access`**（`preferFilePicker: true` 且可用时）：`window.showSaveFilePicker` 弹出系统级"另存为"对话框，**流式写入**对大文件友好
2. **`anchor-download`**（FileSaver Path A）：`<a download>` + `URL.createObjectURL`，覆盖绝大多数现代浏览器；macOS WebView 不走这条
3. **`ms-save-blob`**（FileSaver Path B）：`navigator.msSaveOrOpenBlob`，IE10+ / 旧 Edge
4. **`data-url`**（FileSaver Path C）：弹一个隐藏新窗口（避开拦截器），用 `FileReader` 转 `data:` URL 或 blob URL 灌进去；专门为 Chrome iOS、Safari + `application/octet-stream`、macOS WebView 保底

**对 URL 字符串输入**（`{ url }`），额外的路由规则（与 FileSaver 完全一致）：

- 同源 URL → `anchor-navigate`：直接点 `<a download href=url>`，不发起 fetch
- 跨域 URL + 服务端有 CORS（HEAD 探测通过） → 下载为 Blob，再走上面的策略链
- 跨域 URL + 无 CORS → `anchor-navigate` + `target=_blank`：交给浏览器自己处理（与 FileSaver 行为一致；此时浏览器忽略 `download` 属性，自定义文件名失效）

返回的 `SaveResult.method` 字段告诉你实际走了哪条路径，便于埋点。

## 从 `file-saver` 迁移

```diff
- import { saveAs } from 'file-saver';
+ import { saveAs } from 'savekit';

  saveAs(blob, 'report.pdf');
```

差异点：

- `saveAs(string)` 在旧库里被当作 URL；本库视为**文本内容**。要下载远程文件请改用 `save({ url }, ...)`。
- `saveAs` 现在返回 `Promise<SaveResult>`：`await` 取结果即可，不 `await` 也能正常触发下载（与原库的 fire-and-forget 用法兼容）。
- 浏览器兼容范围与 FileSaver.js 等价（含 `msSaveOrOpenBlob` 等 legacy 路径），不会因为"现代化"丢掉老环境。
- 如需进度 / 成功 / 失败 / 取消的钩子，使用本库的 `onProgress / onSuccess / onError / onAbort`（upstream FileSaver.js 没有这些回调，是本库新增）。

## 浏览器兼容

策略选择与 FileSaver.js 一致，再加上 File System Access 这一首选项。下表是 Blob 类输入的实际走向：

| 浏览器 / 环境 | 实际走的策略 |
|---|---|
| Chrome 89+ / Edge 89+（`preferFilePicker` 为默认 `true`） | `file-system-access` |
| Firefox / Safari 14+ / 上面两者关掉 picker 时 | `anchor-download` |
| 旧 Edge（非 Chromium）/ IE10+ | `ms-save-blob` |
| Chrome iOS、macOS WebView、Safari + `application/octet-stream` | `data-url` |

URL 字符串输入还会经历同源 / CORS 判断，可能直接走 `anchor-navigate`（详见上一节"保存策略的选择"）。

Node.js / SSR / 无 DOM 的 Web Worker 中调用 `save()` 会抛 `SaveError('No available save strategy in this environment')`，请仅在浏览器主线程调用。

## 开发

```bash
pnpm install
pnpm test           # 单测
pnpm typecheck      # tsc --noEmit
pnpm lint           # biome check
pnpm build          # 出 dist/
pnpm playground     # 本地手测页面（在线演示同源代码）
```

## 致谢

灵感与原始实现来自 [Eli Grey](https://eligrey.com) 的 [`FileSaver.js`](https://github.com/eligrey/FileSaver.js)（MIT）。

## License

MIT
