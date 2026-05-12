import { describe, expect, it } from 'vitest';
import { filenameFromRemoteUrl, normalize } from '../src/normalize.js';

describe('normalize', () => {
  it('passes through Blob and reports size', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const out = normalize(blob);
    expect(out.blob).toBe(blob);
    expect(out.totalBytes).toBe(5);
    expect(out.suggestedMime).toBe('text/plain');
  });

  it('overrides MIME when explicit mimeType differs from Blob.type', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const out = normalize(blob, 'application/octet-stream');
    expect(out.blob).not.toBe(blob);
    expect(out.blob?.type).toBe('application/octet-stream');
    expect(out.suggestedMime).toBe('application/octet-stream');
  });

  it('handles File and keeps name-free metadata', () => {
    const file = new File(['x'], 'foo.txt', { type: 'text/plain' });
    const out = normalize(file);
    expect(out.blob).toBe(file);
    expect(out.totalBytes).toBe(1);
    expect(out.suggestedMime).toBe('text/plain');
  });

  it('wraps ArrayBuffer', () => {
    const buf = new TextEncoder().encode('hello').buffer;
    const out = normalize(buf, 'application/octet-stream');
    expect(out.blob).toBeInstanceOf(Blob);
    expect(out.blob?.size).toBe(5);
    expect(out.suggestedMime).toBe('application/octet-stream');
  });

  it('wraps ArrayBufferView (Uint8Array)', () => {
    const view = new TextEncoder().encode('world');
    const out = normalize(view, 'application/octet-stream');
    expect(out.blob?.size).toBe(5);
  });

  it('passes through ReadableStream and leaves total unknown', () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    const out = normalize(stream, 'application/octet-stream');
    expect(out.stream).toBe(stream);
    expect(out.totalBytes).toBeUndefined();
    expect(out.suggestedMime).toBe('application/octet-stream');
  });

  it('treats { url } as remote source', () => {
    const out = normalize({ url: 'https://example.com/file.bin' });
    expect(out.remoteUrl).toBe('https://example.com/file.bin');
    expect(out.blob).toBeUndefined();
  });

  it('wraps string with default text/plain;charset=utf-8', () => {
    const out = normalize('hi there');
    expect(out.blob?.type).toBe('text/plain;charset=utf-8');
    expect(out.totalBytes).toBe(8);
  });

  it('respects explicit mimeType for string', () => {
    const out = normalize('{"a":1}', 'application/json');
    expect(out.blob?.type).toBe('application/json');
  });

  it('throws TypeError for unsupported inputs', () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
    expect(() => normalize(123 as any)).toThrow(TypeError);
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
    expect(() => normalize({ notUrl: 'x' } as any)).toThrow(TypeError);
  });
});

describe('filenameFromRemoteUrl', () => {
  it('extracts last path segment', () => {
    expect(filenameFromRemoteUrl('https://example.com/path/to/file.pdf')).toBe('file.pdf');
  });

  it('decodes percent-encoded names', () => {
    expect(filenameFromRemoteUrl('https://example.com/%E6%8A%A5%E5%91%8A.pdf')).toBe('报告.pdf');
  });

  it('returns undefined when no segment', () => {
    expect(filenameFromRemoteUrl('https://example.com/')).toBeUndefined();
  });

  it('returns undefined for empty path', () => {
    expect(filenameFromRemoteUrl('https://example.com/')).toBeUndefined();
  });
});
