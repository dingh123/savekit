import { describe, expect, it } from 'vitest';
import { maybeAddBom, shouldInjectBom, withBom } from '../src/bom.js';

describe('shouldInjectBom', () => {
  it('returns false when autoBom is false', () => {
    expect(shouldInjectBom('text/plain;charset=utf-8', false)).toBe(false);
  });

  it('returns false when mime missing', () => {
    expect(shouldInjectBom(undefined, true)).toBe(false);
  });

  it('matches text/* with utf-8 charset', () => {
    expect(shouldInjectBom('text/plain;charset=utf-8', true)).toBe(true);
    expect(shouldInjectBom('text/html; charset=UTF-8', true)).toBe(true);
    expect(shouldInjectBom('text/csv;charset=utf-8', true)).toBe(true);
  });

  it('matches application/xml with utf-8 charset', () => {
    expect(shouldInjectBom('application/xml;charset=utf-8', true)).toBe(true);
    expect(shouldInjectBom('application/atom+xml;charset=utf-8', true)).toBe(true);
  });

  it('rejects non-utf-8 or non-text MIME', () => {
    expect(shouldInjectBom('text/plain;charset=gbk', true)).toBe(false);
    expect(shouldInjectBom('application/json;charset=utf-8', true)).toBe(false);
    expect(shouldInjectBom('image/png', true)).toBe(false);
  });
});

describe('withBom', () => {
  it('prepends BOM bytes', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain;charset=utf-8' });
    const out = withBom(blob);
    const buf = new Uint8Array(await out.arrayBuffer());
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    expect(out.type).toBe('text/plain;charset=utf-8');
  });
});

describe('maybeAddBom', () => {
  it('adds BOM when conditions met', async () => {
    const blob = new Blob(['hi'], { type: 'text/plain;charset=utf-8' });
    const out = maybeAddBom(blob, true);
    expect(out.size).toBe(blob.size + 3);
  });

  it('returns blob unchanged when conditions unmet', () => {
    const blob = new Blob(['hi'], { type: 'application/json' });
    expect(maybeAddBom(blob, true)).toBe(blob);
    expect(maybeAddBom(blob, false)).toBe(blob);
  });
});
