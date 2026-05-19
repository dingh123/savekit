import { maybeAddBom } from './bom.js';
import { type EnvCapabilities, detectEnv } from './env.js';
import { SaveAbortError, SaveError } from './errors.js';
import { fetchRemote } from './fetch-remote.js';
import { resolveFilename } from './filename.js';
import { filenameFromRemoteUrl, normalize } from './normalize.js';
import { writeViaAnchorDownload } from './strategies/anchor-download.js';
import { writeViaAnchorNavigate } from './strategies/anchor-navigate.js';
import { writeViaDataUrl } from './strategies/data-url.js';
import { writeViaFileSystemAccess } from './strategies/file-system-access.js';
import { writeViaMsSaveBlob } from './strategies/ms-save-blob.js';
import type {
  NormalizedSource,
  SaveData,
  SaveMethod,
  SaveOptions,
  SaveProgressEvent,
  SaveResult,
} from './types.js';
import { type UaFlags, detectUa } from './ua.js';
import { corsEnabled, isSameOrigin } from './url.js';

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

/**
 * Pick the save strategy for an already-materialized Blob.
 * Mirrors the path-selection logic of the original FileSaver.js, with the
 * File System Access API layered on top as an opt-in preferred path.
 */
function pickBlobMethod(env: EnvCapabilities, ua: UaFlags, preferFilePicker: boolean): SaveMethod {
  if (preferFilePicker && env.hasFileSystemAccess) return 'file-system-access';
  if (env.hasDownloadAttr && !ua.isMacOSWebView) return 'anchor-download';
  if (env.hasMsSaveBlob) return 'ms-save-blob';
  if (env.hasFileReader || env.hasBlobUrl) return 'data-url';
  throw new SaveError('No available save strategy in this environment');
}

interface UrlPlan {
  /** Use anchor-navigate strategy directly without fetching the URL. */
  directAnchor: boolean;
  /** Set target=_blank on the direct anchor — cross-origin no-CORS fallback. */
  newTab: boolean;
}

/**
 * Decide how to handle a URL string source — matches the cross-origin
 * branches of the original FileSaver.js:
 *
 *   anchor-download path (downloadAttr && !macOSWebView):
 *     same-origin               → direct anchor click with `download`
 *     cross-origin + CORS ok    → fetch as Blob, then anchor-download
 *     cross-origin + no CORS    → anchor click with target=_blank
 *
 *   ms-save-blob path:
 *     cross-origin + CORS ok    → fetch then msSaveOrOpenBlob
 *     cross-origin + no CORS    → anchor click with target=_blank
 *     same-origin               → fetch then msSaveOrOpenBlob
 *
 *   popup-fallback path:
 *     always fetch (no cross-origin tab fallback — matches FileSaver Path C)
 */
function planUrlHandling(
  url: string,
  blobMethod: SaveMethod,
  env: EnvCapabilities,
  ua: UaFlags,
): UrlPlan {
  if (typeof document === 'undefined') {
    return { directAnchor: false, newTab: false };
  }

  const sameOrigin = isSameOrigin(url);

  if (blobMethod === 'anchor-download') {
    if (sameOrigin) return { directAnchor: true, newTab: false };
    return corsEnabled(url)
      ? { directAnchor: false, newTab: false }
      : { directAnchor: true, newTab: true };
  }

  if (blobMethod === 'ms-save-blob') {
    // Mirror FileSaver Path B exactly: always probe CORS (even for same-origin),
    // and fall back to a `target=_blank` anchor if the HEAD probe fails.
    // The same-origin case normally succeeds via HEAD but a server that 405s on
    // HEAD will get the new-tab fallback — same as the original.
    void sameOrigin;
    return corsEnabled(url)
      ? { directAnchor: false, newTab: false }
      : { directAnchor: true, newTab: true };
  }

  // file-system-access / data-url: always fetch.
  // Voiding the unused param keeps biome happy without changing semantics.
  void ua;
  return { directAnchor: false, newTab: false };
}

function openDownloadPopup(): Window | null {
  if (typeof window === 'undefined') return null;
  let popup: Window | null = null;
  try {
    popup = window.open('', '_blank');
  } catch {
    return null;
  }
  if (popup) {
    try {
      popup.document.title = 'downloading...';
      if (popup.document.body) popup.document.body.innerText = 'downloading...';
    } catch {
      /* cross-origin or blocked — popup still usable for navigation */
    }
  }
  return popup;
}

function closePopup(popup: Window | null): void {
  if (!popup) return;
  try {
    popup.close();
  } catch {
    /* ignore */
  }
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

export async function save(data: SaveData, opts: SaveOptions = {}): Promise<SaveResult> {
  const started = Date.now();
  const preferFilePicker = opts.preferFilePicker ?? true;
  const autoBom = opts.autoBom ?? false;

  const env = detectEnv();
  const ua = detectUa();

  const emitProgress = (event: SaveProgressEvent): void => {
    runCallback(opts.onProgress, event);
  };

  // Popup must be opened synchronously (before any await) when the fallback
  // path will need it, otherwise the browser's popup blocker stops it.
  let popup: Window | null = null;

  try {
    if (opts.signal?.aborted) {
      throw new SaveAbortError('signal');
    }

    emitProgress({ loaded: 0, phase: 'normalizing' });
    let normalized = normalize(data, opts.mimeType);
    // Source-derived fallback name (e.g. File.name) is the FileSaver.js
    // `blob.name` parity. URL-derived names override it below.
    let fallbackName: string | undefined = normalized.suggestedName;

    // URL string source — decide whether to skip the fetch entirely.
    if (normalized.remoteUrl) {
      fallbackName = filenameFromRemoteUrl(normalized.remoteUrl);

      const blobMethod = pickBlobMethod(env, ua, preferFilePicker);
      const plan = planUrlHandling(normalized.remoteUrl, blobMethod, env, ua);

      if (plan.directAnchor) {
        const filename = resolveFilename(opts.filename, fallbackName, normalized.suggestedMime);
        runCallback(opts.onStart, { filename, method: 'anchor-navigate' });
        writeViaAnchorNavigate({
          url: normalized.remoteUrl,
          filename,
          newTab: plan.newTab,
        });
        emitProgress({ loaded: 0, phase: 'done' });
        const result: SaveResult = {
          filename,
          bytes: 0,
          method: 'anchor-navigate',
          aborted: false,
          durationMs: Date.now() - started,
        };
        runCallback(opts.onSuccess, result);
        return result;
      }

      // We'll fetch — if the resulting path will be data-url, pre-open the
      // popup now (sync) so the browser doesn't block it after the await.
      if (blobMethod === 'data-url') {
        popup = openDownloadPopup();
      }

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

    if (normalized.blob) {
      normalized.blob = maybeAddBom(normalized.blob, autoBom);
      normalized.totalBytes = normalized.blob.size;
    }

    const method = pickBlobMethod(env, ua, preferFilePicker);

    // For non-URL sources, pre-open the popup synchronously here. (Strictly,
    // there is already an await above for the BOM path? No — BOM is sync.
    // So this is still inside the initial sync stretch as long as the source
    // wasn't a remote URL.)
    if (!popup && method === 'data-url') {
      popup = openDownloadPopup();
    }
    if (popup && method !== 'data-url') {
      closePopup(popup);
      popup = null;
    }

    const filename = resolveFilename(
      opts.filename,
      fallbackName,
      normalized.suggestedMime ?? normalized.blob?.type,
    );

    const startInfo: { filename: string; method: SaveMethod; total?: number } = {
      filename,
      method,
    };
    if (normalized.totalBytes !== undefined) startInfo.total = normalized.totalBytes;
    runCallback(opts.onStart, startInfo);

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
      const result = await writeViaAnchorDownload({ filename, blob: normalized.blob });
      bytes = result.bytes;
      emitProgress({ loaded: bytes, total: bytes, phase: 'writing' });
    } else if (method === 'ms-save-blob') {
      if (!normalized.blob) {
        if (normalized.stream) {
          normalized.blob = await streamToBlob(normalized.stream, normalized.suggestedMime);
        } else {
          throw new SaveError('No blob source available for ms-save-blob');
        }
      }
      const result = writeViaMsSaveBlob({ filename, blob: normalized.blob });
      bytes = result.bytes;
      emitProgress({ loaded: bytes, total: bytes, phase: 'writing' });
    } else {
      // data-url
      if (!normalized.blob) {
        if (normalized.stream) {
          normalized.blob = await streamToBlob(normalized.stream, normalized.suggestedMime);
        } else {
          throw new SaveError('No blob source available for data-url');
        }
      }
      const result = await writeViaDataUrl({ blob: normalized.blob, popup, ua });
      bytes = result.bytes;
      // popup ownership transferred to navigation — don't close it.
      popup = null;
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
    closePopup(popup);
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
