import { SaveAbortError, SaveDownloadError } from './errors.js';

export interface FetchRemoteOptions {
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number | undefined) => void;
}

export interface FetchRemoteResult {
  blob: Blob;
  total: number;
  mimeType: string | undefined;
}

export async function fetchRemote(
  url: string,
  opts: FetchRemoteOptions = {},
): Promise<FetchRemoteResult> {
  const { signal, onProgress } = opts;

  if (signal?.aborted) {
    throw new SaveAbortError('signal');
  }

  let response: Response;
  try {
    const init: RequestInit = {};
    if (signal) init.signal = signal;
    response = await fetch(url, init);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new SaveAbortError('signal');
    }
    throw new SaveDownloadError(url, undefined, (err as Error)?.message);
  }

  if (!response.ok) {
    throw new SaveDownloadError(url, response.status);
  }

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? Number.parseInt(contentLength, 10) : undefined;
  const mimeType = response.headers.get('content-type') ?? undefined;

  if (!response.body || typeof response.body.getReader !== 'function') {
    const blob = await response.blob();
    onProgress?.(blob.size, total ?? blob.size);
    return { blob, total: blob.size, mimeType };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {});
        throw new SaveAbortError('signal');
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        onProgress?.(loaded, total);
      }
    }
  } catch (err) {
    if (err instanceof SaveAbortError) throw err;
    if ((err as Error)?.name === 'AbortError') {
      throw new SaveAbortError('signal');
    }
    throw new SaveDownloadError(url, response.status, (err as Error)?.message);
  }

  // Cast to BlobPart[] — Uint8Array is a valid BlobPart at runtime.
  const blob = new Blob(chunks as unknown as BlobPart[], mimeType ? { type: mimeType } : undefined);
  return { blob, total: loaded, mimeType };
}
