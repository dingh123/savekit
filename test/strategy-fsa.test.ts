import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveAbortError } from '../src/errors.js';
import { save } from '../src/save.js';

interface FakeWritable {
  written: Uint8Array[];
  closed: boolean;
  aborted: boolean;
  write: (chunk: Uint8Array | { type: string; data: Uint8Array }) => Promise<void>;
  close: () => Promise<void>;
  abort: () => Promise<void>;
}

function installFsa(opts: {
  picker?: () => Promise<{ createWritable: () => Promise<FakeWritable> }>;
  cancelled?: boolean;
  writableFailsAt?: number;
}): { writable: FakeWritable; restore: () => void } {
  const writable: FakeWritable = {
    written: [],
    closed: false,
    aborted: false,
    async write(chunk) {
      const bytes =
        chunk instanceof Uint8Array ? chunk : 'data' in chunk ? chunk.data : new Uint8Array();
      writable.written.push(bytes);
      if (opts.writableFailsAt !== undefined && writable.written.length === opts.writableFailsAt) {
        throw new Error('write failed');
      }
    },
    async close() {
      writable.closed = true;
    },
    async abort() {
      writable.aborted = true;
    },
  };

  const picker =
    opts.picker ??
    (async () => {
      if (opts.cancelled) {
        const err = new Error('user cancelled');
        err.name = 'AbortError';
        throw err;
      }
      return {
        createWritable: async () => writable,
      };
    });

  // biome-ignore lint/suspicious/noExplicitAny: monkey-patching window for test
  (window as any).showSaveFilePicker = picker;

  return {
    writable,
    restore: () => {
      // biome-ignore lint/suspicious/noExplicitAny: monkey-patch cleanup
      (window as any).showSaveFilePicker = undefined;
    },
  };
}

afterEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: monkey-patch cleanup
  (window as any).showSaveFilePicker = undefined;
  vi.restoreAllMocks();
});

describe('file-system-access strategy (mocked)', () => {
  it('writes a Blob through createWritable and reports writing progress', async () => {
    const fsa = installFsa({});
    const progress: Array<{ phase: string; loaded: number; total?: number }> = [];
    const result = await save('hello', {
      filename: 'a.txt',
      onProgress: (e) => progress.push({ phase: e.phase, loaded: e.loaded, total: e.total }),
    });
    expect(result.method).toBe('file-system-access');
    expect(result.bytes).toBe(5);
    expect(fsa.writable.closed).toBe(true);
    expect(fsa.writable.written.length).toBeGreaterThan(0);
    expect(progress.some((p) => p.phase === 'picking')).toBe(true);
    expect(progress.some((p) => p.phase === 'writing')).toBe(true);
    fsa.restore();
  });

  it('reports SaveAbortError when picker is cancelled by user', async () => {
    const fsa = installFsa({ cancelled: true });
    const abortSpy = vi.fn();
    await expect(save('hi', { filename: 'a.txt', onAbort: abortSpy })).rejects.toBeInstanceOf(
      SaveAbortError,
    );
    expect(abortSpy).toHaveBeenCalledOnce();
    fsa.restore();
  });

  it('streams a ReadableStream directly (no Blob intermediate)', async () => {
    const fsa = installFsa({});
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1, 2, 3]));
        c.enqueue(new Uint8Array([4, 5]));
        c.close();
      },
    });
    const result = await save(stream, { filename: 'a.bin', mimeType: 'application/octet-stream' });
    expect(result.bytes).toBe(5);
    expect(fsa.writable.written.length).toBe(2);
    fsa.restore();
  });

  it('aborts via signal mid-write and calls onAbort', async () => {
    const fsa = installFsa({});
    const ctrl = new AbortController();
    ctrl.abort();
    const abortSpy = vi.fn();
    await expect(
      save('hello', { filename: 'a.txt', signal: ctrl.signal, onAbort: abortSpy }),
    ).rejects.toBeInstanceOf(SaveAbortError);
    expect(abortSpy).toHaveBeenCalledOnce();
    fsa.restore();
  });

  it('respects preferFilePicker:false and falls back to anchor-download', async () => {
    const fsa = installFsa({});
    const origCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    const result = await save('hi', { filename: 'a.txt', preferFilePicker: false });
    expect(result.method).toBe('anchor-download');
    URL.createObjectURL = origCreateObjectURL;
    fsa.restore();
  });
});
