import type { NormalizedSource, SaveData } from './types.js';

function isArrayBufferView(value: unknown): value is ArrayBufferView {
  return ArrayBuffer.isView(value);
}

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return typeof ReadableStream !== 'undefined' && value instanceof ReadableStream;
}

function isUrlObject(value: unknown): value is { url: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    typeof (value as { url: unknown }).url === 'string'
  );
}

export function normalize(data: SaveData, mimeType?: string): NormalizedSource {
  if (data instanceof Blob) {
    const finalMime = mimeType ?? data.type;
    const blob =
      finalMime && finalMime !== data.type ? new Blob([data], { type: finalMime }) : data;
    const result: NormalizedSource = {
      blob,
      totalBytes: blob.size,
    };
    if (finalMime) result.suggestedMime = finalMime;
    if (data instanceof File) result.suggestedMime = result.suggestedMime ?? data.type;
    return result;
  }

  if (data instanceof ArrayBuffer) {
    const blob = new Blob([data], mimeType ? { type: mimeType } : undefined);
    const result: NormalizedSource = { blob, totalBytes: blob.size };
    if (mimeType) result.suggestedMime = mimeType;
    return result;
  }

  if (isArrayBufferView(data)) {
    // TS 5.7 distinguishes ArrayBuffer from SharedArrayBuffer in ArrayBufferView<T>;
    // Blob accepts both at runtime, so we cast through BlobPart.
    const blob = new Blob([data as unknown as BlobPart], mimeType ? { type: mimeType } : undefined);
    const result: NormalizedSource = { blob, totalBytes: blob.size };
    if (mimeType) result.suggestedMime = mimeType;
    return result;
  }

  if (isReadableStream(data)) {
    const result: NormalizedSource = { stream: data };
    if (mimeType) result.suggestedMime = mimeType;
    return result;
  }

  if (isUrlObject(data)) {
    const result: NormalizedSource = { remoteUrl: data.url };
    if (mimeType) result.suggestedMime = mimeType;
    return result;
  }

  if (typeof data === 'string') {
    const finalMime = mimeType ?? 'text/plain;charset=utf-8';
    const blob = new Blob([data], { type: finalMime });
    return { blob, totalBytes: blob.size, suggestedMime: finalMime };
  }

  throw new TypeError('Unsupported SaveData type');
}

export function filenameFromRemoteUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url, typeof location !== 'undefined' ? location.href : 'http://x/');
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    if (!last) return undefined;
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  } catch {
    return undefined;
  }
}
