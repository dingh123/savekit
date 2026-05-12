import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveAbortError, SaveDownloadError } from '../src/errors.js';
import { fetchRemote } from '../src/fetch-remote.js';

function makeResponse(
  chunks: Uint8Array[],
  init: { status?: number; headers?: Record<string, string>; ok?: boolean } = {},
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  const headers = new Headers(init.headers ?? {});
  return new Response(stream, {
    status: init.status ?? 200,
    headers,
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // each test sets its own fetch mock
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('fetchRemote', () => {
  it('downloads and reports progress with Content-Length', async () => {
    const c1 = new Uint8Array([1, 2, 3]);
    const c2 = new Uint8Array([4, 5]);
    globalThis.fetch = vi.fn(async () =>
      makeResponse([c1, c2], {
        headers: { 'content-length': '5', 'content-type': 'application/octet-stream' },
      }),
    ) as typeof fetch;

    const progress: Array<[number, number | undefined]> = [];
    const result = await fetchRemote('https://example.com/file.bin', {
      onProgress: (l, t) => progress.push([l, t]),
    });

    expect(result.blob.size).toBe(5);
    expect(result.total).toBe(5);
    expect(result.mimeType).toBe('application/octet-stream');
    expect(progress).toEqual([
      [3, 5],
      [5, 5],
    ]);
  });

  it('downloads when Content-Length is missing (total undefined)', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeResponse([new Uint8Array([9, 9, 9])], { headers: {} }),
    ) as typeof fetch;

    const progress: Array<[number, number | undefined]> = [];
    const result = await fetchRemote('https://example.com/x', {
      onProgress: (l, t) => progress.push([l, t]),
    });

    expect(result.blob.size).toBe(3);
    expect(progress).toEqual([[3, undefined]]);
  });

  it('throws SaveDownloadError on HTTP error', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('not found', { status: 404 }),
    ) as typeof fetch;

    await expect(fetchRemote('https://example.com/missing')).rejects.toBeInstanceOf(
      SaveDownloadError,
    );
  });

  it('throws SaveAbortError when signal already aborted before fetch', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      fetchRemote('https://example.com/x', { signal: ctrl.signal }),
    ).rejects.toBeInstanceOf(SaveAbortError);
  });

  it('throws SaveAbortError when fetch is aborted', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      const signal = (init as RequestInit | undefined)?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as typeof fetch;

    const ctrl = new AbortController();
    const promise = fetchRemote('https://example.com/x', { signal: ctrl.signal });
    ctrl.abort();
    await expect(promise).rejects.toBeInstanceOf(SaveAbortError);
  });
});
