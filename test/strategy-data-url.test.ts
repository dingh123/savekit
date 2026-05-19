import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeViaDataUrl } from '../src/strategies/data-url.js';

const originalLocationHref = Object.getOwnPropertyDescriptor(window, 'location');

describe('data-url strategy', () => {
  let assignedUrl = '';
  let restoreLocation: () => void;

  beforeEach(() => {
    assignedUrl = '';
    // Replace location with a settable href accessor
    const fakeLocation = {
      get href() {
        return assignedUrl;
      },
      set href(v: string) {
        assignedUrl = v;
      },
    };
    Object.defineProperty(window, 'location', {
      value: fakeLocation,
      writable: true,
      configurable: true,
    });
    restoreLocation = () => {
      if (originalLocationHref) {
        Object.defineProperty(window, 'location', originalLocationHref);
      }
    };
  });

  afterEach(() => {
    restoreLocation();
    vi.restoreAllMocks();
  });

  it('uses FileReader → data:attachment URL when UA flags say so (macOS WebView)', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const result = await writeViaDataUrl({
      blob,
      ua: { isMacOSWebView: true, isSafari: false, isChromeIOS: false },
    });
    expect(result.bytes).toBe(5);
    expect(assignedUrl.startsWith('data:attachment/file;')).toBe(true);
  });

  it('preserves data: URL as-is for Chrome iOS', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    await writeViaDataUrl({
      blob,
      ua: { isMacOSWebView: false, isSafari: false, isChromeIOS: true },
    });
    expect(assignedUrl.startsWith('data:text/plain')).toBe(true);
  });

  it('uses blob: URL when no UA flag triggers FileReader path', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    await writeViaDataUrl({
      blob,
      ua: { isMacOSWebView: false, isSafari: false, isChromeIOS: false },
    });
    expect(assignedUrl.startsWith('blob:')).toBe(true);
  });

  it('Safari uses FileReader only when MIME is application/octet-stream', async () => {
    const blob = new Blob(['x'], { type: 'application/octet-stream' });
    await writeViaDataUrl({
      blob,
      ua: { isMacOSWebView: false, isSafari: true, isChromeIOS: false },
    });
    expect(assignedUrl.startsWith('data:attachment/file;')).toBe(true);
  });
});
