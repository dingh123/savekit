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

  it('reads blob and assigns a data: attachment URL to location', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const result = await writeViaDataUrl({ blob });
    expect(result.bytes).toBe(5);
    expect(assignedUrl.startsWith('data:attachment/file;')).toBe(true);
  });
});
