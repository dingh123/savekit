export interface EnvCapabilities {
  hasFileSystemAccess: boolean;
  hasDownloadAttr: boolean;
  hasFileReader: boolean;
  hasBlobUrl: boolean;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function detectEnv(): EnvCapabilities {
  const hasWindow = typeof window !== 'undefined';
  return {
    hasFileSystemAccess: safe(
      () => hasWindow && typeof window.showSaveFilePicker === 'function',
      false,
    ),
    hasDownloadAttr: safe(
      () => typeof HTMLAnchorElement !== 'undefined' && 'download' in HTMLAnchorElement.prototype,
      false,
    ),
    hasFileReader: safe(() => typeof FileReader !== 'undefined', false),
    hasBlobUrl: safe(
      () =>
        typeof URL !== 'undefined' &&
        (typeof URL.createObjectURL === 'function' ||
          // biome-ignore lint/suspicious/noExplicitAny: legacy webkit URL
          typeof (globalThis as any).webkitURL?.createObjectURL === 'function'),
      false,
    ),
  };
}

export function getBlobUrlApi(): {
  createObjectURL: typeof URL.createObjectURL;
  revokeObjectURL: typeof URL.revokeObjectURL;
} {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return URL;
  }
  // biome-ignore lint/suspicious/noExplicitAny: legacy webkit URL fallback
  const webkit = (globalThis as any).webkitURL;
  if (webkit?.createObjectURL) return webkit;
  throw new Error('No Blob URL API available');
}
