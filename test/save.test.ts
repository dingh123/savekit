import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveAbortError, SaveDownloadError } from '../src/errors.js';
import { save, saveAs } from '../src/save.js';

interface CapturedAnchor {
  href: string;
  download: string;
  target: string;
  clicked: boolean;
}

function spyAnchor(): {
  captured: CapturedAnchor[];
  restore: () => void;
} {
  const captured: CapturedAnchor[] = [];
  const origCreateNS = document.createElementNS.bind(document);
  const origCreateObjectURL = URL.createObjectURL.bind(URL);
  const origRevoke = URL.revokeObjectURL.bind(URL);

  URL.createObjectURL = vi.fn(() => `blob:mock-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();

  document.createElementNS = ((ns: string, tag: string) => {
    const el = origCreateNS(ns, tag) as HTMLAnchorElement;
    if (tag === 'a') {
      const entry: CapturedAnchor = { href: '', download: '', target: '', clicked: false };
      captured.push(entry);
      const markClicked = () => {
        entry.href = el.href;
        entry.download = el.download;
        entry.target = el.target;
        entry.clicked = true;
      };
      const origClick = el.click.bind(el);
      el.click = () => {
        markClicked();
        origClick();
      };
      const origDispatch = el.dispatchEvent.bind(el);
      el.dispatchEvent = (ev: Event) => {
        if (ev.type === 'click') markClicked();
        return origDispatch(ev);
      };
    }
    return el;
    // biome-ignore lint/suspicious/noExplicitAny: matching DOM signature
  }) as any;

  return {
    captured,
    restore: () => {
      document.createElementNS = origCreateNS;
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevoke;
    },
  };
}

// Stub synchronous XMLHttpRequest HEAD so corsEnabled() resolves to `true`
// inside happy-dom. The real browser would have actually probed the server.
function stubCorsProbe(status = 200): () => void {
  // biome-ignore lint/suspicious/noExplicitAny: hand-rolled minimal XHR stub
  const original = (globalThis as any).XMLHttpRequest;
  class XhrStub {
    status = 0;
    open(_method: string, _url: string, _async?: boolean) {
      /* noop */
    }
    send() {
      this.status = status;
    }
  }
  // biome-ignore lint/suspicious/noExplicitAny: install stub onto globalThis
  (globalThis as any).XMLHttpRequest = XhrStub as any;
  return () => {
    // biome-ignore lint/suspicious/noExplicitAny: restore original
    (globalThis as any).XMLHttpRequest = original;
  };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('save() — anchor-download path (happy-dom default)', () => {
  let anchor: ReturnType<typeof spyAnchor>;

  beforeEach(() => {
    anchor = spyAnchor();
  });

  afterEach(() => {
    anchor.restore();
  });

  it('saves a text string with inferred MIME and filename', async () => {
    const result = await save('hello world', { filename: 'greeting' });
    expect(result.method).toBe('anchor-download');
    expect(result.filename).toBe('greeting.txt');
    expect(result.bytes).toBe(11);
    expect(result.aborted).toBe(false);
    expect(anchor.captured).toHaveLength(1);
    expect(anchor.captured[0]?.clicked).toBe(true);
    expect(anchor.captured[0]?.download).toBe('greeting.txt');
  });

  it('saves a Blob with explicit filename', async () => {
    const blob = new Blob(['{"a":1}'], { type: 'application/json' });
    const result = await save(blob, { filename: 'data.json' });
    expect(result.filename).toBe('data.json');
    expect(result.bytes).toBe(blob.size);
  });

  it('saveAs matches save signature', async () => {
    const result = await saveAs('hi', 'a.txt');
    expect(result.filename).toBe('a.txt');
  });

  it('saveAs filename overrides options.filename slot', async () => {
    const result = await saveAs('hi', 'override.txt', { mimeType: 'text/plain' });
    expect(result.filename).toBe('override.txt');
  });

  it('falls back to File.name when no filename provided (FileSaver parity)', async () => {
    const file = new File(['hello'], 'photo.png', { type: 'image/png' });
    const result = await save(file);
    expect(result.filename).toBe('photo.png');
  });

  it('explicit filename wins over File.name', async () => {
    const file = new File(['hello'], 'photo.png', { type: 'image/png' });
    const result = await save(file, { filename: 'avatar.png' });
    expect(result.filename).toBe('avatar.png');
  });

  it('injects BOM when autoBom + utf-8 text MIME', async () => {
    const result = await save('hello', {
      filename: 'a.txt',
      mimeType: 'text/plain;charset=utf-8',
      autoBom: true,
    });
    expect(result.bytes).toBe(8); // 5 + 3 BOM
  });

  it('sanitizes illegal characters in filename', async () => {
    const result = await save('x', { filename: 'a/b:c.txt' });
    expect(result.filename).toBe('a_b_c.txt');
  });

  it('handles remote URL: downloads then saves (cross-origin + CORS)', async () => {
    const restoreCors = stubCorsProbe(200);
    globalThis.fetch = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([1, 2, 3, 4]));
          c.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-length': '4', 'content-type': 'application/octet-stream' },
      });
    }) as typeof fetch;

    try {
      const result = await save({ url: 'https://example.com/path/blob.bin' });
      expect(result.method).toBe('anchor-download');
      expect(result.filename).toBe('blob.bin');
      expect(result.bytes).toBe(4);
    } finally {
      restoreCors();
    }
  });

  it('cross-origin URL without CORS falls back to anchor target=_blank (FileSaver parity)', async () => {
    const restoreCors = stubCorsProbe(0);
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    try {
      const result = await save({ url: 'https://other.example.com/file.zip' });
      expect(result.method).toBe('anchor-navigate');
      expect(fetchSpy).not.toHaveBeenCalled();
      const last = anchor.captured.at(-1);
      expect(last?.clicked).toBe(true);
      expect(last?.target).toBe('_blank');
      expect(last?.href).toBe('https://other.example.com/file.zip');
    } finally {
      restoreCors();
    }
  });

  it('same-origin URL clicks anchor directly without fetch', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await save({ url: '/files/report.pdf' }, { filename: 'report.pdf' });
    expect(result.method).toBe('anchor-navigate');
    expect(fetchSpy).not.toHaveBeenCalled();
    const last = anchor.captured.at(-1);
    expect(last?.clicked).toBe(true);
    expect(last?.download).toBe('report.pdf');
    expect(last?.target).toBe('');
  });

  it('throws SaveAbortError when signal already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(save('hi', { filename: 'a.txt', signal: ctrl.signal })).rejects.toBeInstanceOf(
      SaveAbortError,
    );
  });

  it('propagates SaveDownloadError on 404', async () => {
    const restoreCors = stubCorsProbe(200);
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 404 })) as typeof fetch;
    try {
      await expect(save({ url: 'https://example.com/missing' })).rejects.toBeInstanceOf(
        SaveDownloadError,
      );
    } finally {
      restoreCors();
    }
  });
});
