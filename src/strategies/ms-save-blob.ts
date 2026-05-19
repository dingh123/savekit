import { SaveError } from '../errors.js';

export interface MsSaveBlobOptions {
  blob: Blob;
  filename: string;
}

export interface MsSaveBlobResult {
  bytes: number;
}

interface LegacyNavigator extends Navigator {
  msSaveOrOpenBlob?: (blob: Blob, filename: string) => boolean;
}

/**
 * Legacy Edge / IE10+ save path via `navigator.msSaveOrOpenBlob`. Mirrors
 * the corresponding branch in the original FileSaver.js so users on those
 * runtimes still get a working download.
 */
export function writeViaMsSaveBlob(opts: MsSaveBlobOptions): MsSaveBlobResult {
  if (typeof navigator === 'undefined') {
    throw new SaveError('navigator is not available; cannot use ms-save-blob strategy');
  }
  const nav = navigator as LegacyNavigator;
  if (typeof nav.msSaveOrOpenBlob !== 'function') {
    throw new SaveError('navigator.msSaveOrOpenBlob is not available');
  }
  nav.msSaveOrOpenBlob(opts.blob, opts.filename);
  return { bytes: opts.blob.size };
}
