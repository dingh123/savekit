import { maybeAddBom } from './bom.js';
import { detectEnv } from './env.js';
import { SaveAbortError, SaveError } from './errors.js';
import { fetchRemote } from './fetch-remote.js';
import { resolveFilename } from './filename.js';
import { filenameFromRemoteUrl, normalize } from './normalize.js';
import { writeViaAnchorDownload } from './strategies/anchor-download.js';
import { writeViaDataUrl } from './strategies/data-url.js';
import { writeViaFileSystemAccess } from './strategies/file-system-access.js';
import type {
  NormalizedSource,
  SaveData,
  SaveMethod,
  SaveOptions,
  SaveProgressEvent,
  SaveResult,
} from './types.js';

function runCallback<T>(cb: ((arg: T) => void) | undefined, arg: T): void {
  if (!cb) return;
  try {
    cb(arg);
  } catch (err) {
    // Callback errors must never derail the save flow.
    // eslint-disable-next-line no-console
    console.error('[savekit] callback threw:', err);
  }
}

function runVoidCallback(cb: (() => void) | undefined): void {
  if (!cb) return;
  try {
    cb();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[savekit] callback threw:', err);
  }
}

function pickMethod(preferFilePicker: boolean): SaveMethod {
  const env = detectEnv();
  if (preferFilePicker && env.hasFileSystemAccess) return 'file-system-access';
  if (env.hasDownloadAttr && env.hasBlobUrl) return 'anchor-download';
  if (env.hasFileReader) return 'data-url';
  if (env.hasDownloadAttr) return 'anchor-download';
  throw new SaveError('No available save strategy in this environment');
}

export async function save(data: SaveData, opts: SaveOptions = {}): Promise<SaveResult> {
  const started = Date.now();
  const preferFilePicker = opts.preferFilePicker ?? true;
  const autoBom = opts.autoBom ?? false;

  const emitProgress = (event: SaveProgressEvent): void => {
    runCallback(opts.onProgress, event);
  };

  try {
    if (opts.signal?.aborted) {
      throw new SaveAbortError('signal');
    }

    // 1) Normalize
    emitProgress({ loaded: 0, phase: 'normalizing' });
    let normalized = normalize(data, opts.mimeType);
    let fallbackName: string | undefined;

    // 2) Fetch remote URL if needed
    if (normalized.remoteUrl) {
      fallbackName = filenameFromRemoteUrl(normalized.remoteUrl);
      const downloaded = await fetchRemote(normalized.remoteUrl, {
        signal: opts.signal,
        onProgress: (loaded, total) => {
          emitProgress({ loaded, total, phase: 'downloading' });
        },
      });
      const replaced: NormalizedSource = {
        blob: downloaded.blob,
        totalBytes: downloaded.total,
      };
      if (opts.mimeType ?? downloaded.mimeType) {
        replaced.suggestedMime = opts.mimeType ?? downloaded.mimeType;
      }
      normalized = replaced;
    }

    if (opts.signal?.aborted) {
      throw new SaveAbortError('signal');
    }

    // 3) BOM (only applies to Blob path)
    if (normalized.blob) {
      normalized.blob = maybeAddBom(normalized.blob, autoBom);
      normalized.totalBytes = normalized.blob.size;
    }

    // 4) Choose strategy
    const method = pickMethod(preferFilePicker);

    // 5) Resolve filename
    const filename = resolveFilename(
      opts.filename,
      fallbackName,
      normalized.suggestedMime ?? normalized.blob?.type,
    );

    // 6) Announce start
    const startInfo: { filename: string; method: SaveMethod; total?: number } = {
      filename,
      method,
    };
    if (normalized.totalBytes !== undefined) startInfo.total = normalized.totalBytes;
    runCallback(opts.onStart, startInfo);

    // 7) Execute strategy
    let bytes = 0;
    if (method === 'file-system-access') {
      const source = normalized.blob ?? normalized.stream;
      if (!source) throw new SaveError('No source available for file-system-access');
      emitProgress({ loaded: 0, phase: 'picking' });
      const fsaOpts: Parameters<typeof writeViaFileSystemAccess>[0] = {
        filename,
        source,
        totalBytes: normalized.totalBytes,
        onPicking: () => emitProgress({ loaded: 0, phase: 'picking' }),
        onWriting: (loaded, total) => emitProgress({ loaded, total, phase: 'writing' }),
      };
      if (opts.pickerTypes) fsaOpts.pickerTypes = opts.pickerTypes;
      if (opts.signal) fsaOpts.signal = opts.signal;
      const result = await writeViaFileSystemAccess(fsaOpts);
      bytes = result.bytes;
    } else if (method === 'anchor-download') {
      if (!normalized.blob) {
        if (normalized.stream) {
          normalized.blob = await streamToBlob(normalized.stream, normalized.suggestedMime);
        } else {
          throw new SaveError('No blob source available for anchor-download');
        }
      }
      const result = writeViaAnchorDownload({ filename, blob: normalized.blob });
      bytes = result.bytes;
      emitProgress({ loaded: bytes, total: bytes, phase: 'writing' });
    } else {
      if (!normalized.blob) {
        if (normalized.stream) {
          normalized.blob = await streamToBlob(normalized.stream, normalized.suggestedMime);
        } else {
          throw new SaveError('No blob source available for data-url');
        }
      }
      const result = await writeViaDataUrl({ blob: normalized.blob });
      bytes = result.bytes;
      emitProgress({ loaded: bytes, total: bytes, phase: 'writing' });
    }

    emitProgress({ loaded: bytes, total: bytes, phase: 'done' });

    const result: SaveResult = {
      filename,
      bytes,
      method,
      aborted: false,
      durationMs: Date.now() - started,
    };
    runCallback(opts.onSuccess, result);
    return result;
  } catch (err) {
    if (err instanceof SaveAbortError) {
      runVoidCallback(opts.onAbort);
      throw err;
    }
    const normalizedErr = err instanceof Error ? err : new SaveError(String(err));
    runCallback(opts.onError, normalizedErr);
    throw normalizedErr;
  }
}

export async function saveAs(
  data: SaveData,
  filename?: string,
  opts: Omit<SaveOptions, 'filename'> = {},
): Promise<SaveResult> {
  const merged: SaveOptions = { ...opts };
  if (filename !== undefined) merged.filename = filename;
  return save(data, merged);
}

async function streamToBlob(
  stream: ReadableStream<Uint8Array>,
  mimeType: string | undefined,
): Promise<Blob> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return new Blob(chunks as unknown as BlobPart[], mimeType ? { type: mimeType } : undefined);
}
