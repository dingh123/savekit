import { getBlobUrlApi } from '../env.js';
import { SaveError } from '../errors.js';

const REVOKE_DELAY_MS = 40_000;

export interface AnchorWriteOptions {
  filename: string;
  blob: Blob;
}

export interface AnchorWriteResult {
  bytes: number;
}

export function writeViaAnchorDownload(opts: AnchorWriteOptions): AnchorWriteResult {
  if (typeof document === 'undefined') {
    throw new SaveError('document is not available; cannot use anchor-download strategy');
  }

  const urlApi = getBlobUrlApi();
  const objectUrl = urlApi.createObjectURL(opts.blob);

  const a = document.createElementNS('http://www.w3.org/1999/xhtml', 'a') as HTMLAnchorElement;
  a.href = objectUrl;
  a.download = opts.filename;
  a.rel = 'noopener';
  a.style.display = 'none';

  document.body?.appendChild(a);
  try {
    a.click();
  } finally {
    document.body?.removeChild(a);
  }

  setTimeout(() => {
    try {
      urlApi.revokeObjectURL(objectUrl);
    } catch {
      /* ignore */
    }
  }, REVOKE_DELAY_MS);

  return { bytes: opts.blob.size };
}
