import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveAbortError, SaveDownloadError } from '../src/errors.js';
import { save } from '../src/save.js';
import type { SaveOptions, SaveProgressEvent } from '../src/types.js';

function stubAnchor(): () => void {
  const origCreateObjectURL = URL.createObjectURL.bind(URL);
  const origRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  return () => {
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevoke;
  };
}

function stubCorsProbe(status = 200): () => void {
  // biome-ignore lint/suspicious/noExplicitAny: hand-rolled minimal XHR stub
  const original = (globalThis as any).XMLHttpRequest;
  class XhrStub {
    status = 0;
    open() {
      /* noop */
    }
    send() {
      this.status = status;
    }
  }
  // biome-ignore lint/suspicious/noExplicitAny: install stub
  (globalThis as any).XMLHttpRequest = XhrStub as any;
  return () => {
    // biome-ignore lint/suspicious/noExplicitAny: restore
    (globalThis as any).XMLHttpRequest = original;
  };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('callbacks', () => {
  let restoreAnchor: () => void;

  beforeEach(() => {
    restoreAnchor = stubAnchor();
  });

  afterEach(() => {
    restoreAnchor();
  });

  it('fires onStart → onProgress (writing) → onSuccess on happy path; never onError/onAbort', async () => {
    const order: string[] = [];
    const opts: SaveOptions = {
      filename: 'a.txt',
      onStart: (info) => {
        order.push(`start:${info.method}:${info.filename}:${info.total}`);
      },
      onProgress: (e) => order.push(`progress:${e.phase}:${e.loaded}/${e.total}`),
      onSuccess: (r) => order.push(`success:${r.filename}:${r.bytes}`),
      onError: () => order.push('error'),
      onAbort: () => order.push('abort'),
    };
    await save('hello', opts);
    expect(order).toContain('start:anchor-download:a.txt:5');
    expect(order[order.length - 1]).toBe('success:a.txt:5');
    expect(order).not.toContain('error');
    expect(order).not.toContain('abort');
    // First progress is normalizing, last before success is done
    expect(order[0]).toBe('progress:normalizing:0/undefined');
    expect(order.some((s) => s.startsWith('progress:writing:'))).toBe(true);
    expect(order.some((s) => s === 'progress:done:5/5')).toBe(true);
  });

  it('reports downloading progress for remote URL', async () => {
    const restoreCors = stubCorsProbe(200);
    globalThis.fetch = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([1, 2]));
          c.enqueue(new Uint8Array([3, 4, 5]));
          c.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-length': '5', 'content-type': 'application/octet-stream' },
      });
    }) as typeof fetch;

    const events: SaveProgressEvent[] = [];
    try {
      const result = await save(
        { url: 'https://example.com/file.bin' },
        { onProgress: (e) => events.push(e) },
      );
      expect(result.bytes).toBe(5);
      const downloading = events.filter((e) => e.phase === 'downloading');
      expect(downloading.length).toBeGreaterThanOrEqual(2);
      expect(downloading[downloading.length - 1]?.loaded).toBe(5);
      expect(downloading[downloading.length - 1]?.total).toBe(5);
    } finally {
      restoreCors();
    }
  });

  it('fires onAbort + rejects with SaveAbortError; never onSuccess/onError', async () => {
    const order: string[] = [];
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      save('hello', {
        filename: 'a.txt',
        signal: ctrl.signal,
        onStart: () => order.push('start'),
        onSuccess: () => order.push('success'),
        onError: () => order.push('error'),
        onAbort: () => order.push('abort'),
      }),
    ).rejects.toBeInstanceOf(SaveAbortError);
    expect(order).toEqual(['abort']);
  });

  it('fires onError + rejects with the error; never onSuccess/onAbort', async () => {
    const restoreCors = stubCorsProbe(200);
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as typeof fetch;
    const order: string[] = [];
    const caught: Error[] = [];
    try {
      await expect(
        save(
          { url: 'https://example.com/x' },
          {
            onSuccess: () => order.push('success'),
            onError: (e) => {
              order.push('error');
              caught.push(e);
            },
            onAbort: () => order.push('abort'),
          },
        ),
      ).rejects.toBeInstanceOf(SaveDownloadError);
      expect(order).toEqual(['error']);
      expect(caught[0]).toBeInstanceOf(SaveDownloadError);
    } finally {
      restoreCors();
    }
  });

  it('exception inside a callback does NOT derail the save flow', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await save('hi', {
      filename: 'a.txt',
      onStart: () => {
        throw new Error('boom from onStart');
      },
      onProgress: () => {
        throw new Error('boom from onProgress');
      },
    });
    expect(result.filename).toBe('a.txt');
    expect(errSpy).toHaveBeenCalled();
  });

  it('aborts mid-download when signal fires', async () => {
    const restoreCors = stubCorsProbe(200);
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

    const order: string[] = [];
    const ctrl = new AbortController();
    const promise = save(
      { url: 'https://example.com/x' },
      {
        signal: ctrl.signal,
        onAbort: () => order.push('abort'),
        onError: () => order.push('error'),
        onSuccess: () => order.push('success'),
      },
    );
    ctrl.abort();
    try {
      await expect(promise).rejects.toBeInstanceOf(SaveAbortError);
      expect(order).toEqual(['abort']);
    } finally {
      restoreCors();
    }
  });
});
