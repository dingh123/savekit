import { clickAnchor } from '../dom.js';
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

export async function writeViaAnchorDownload(opts: AnchorWriteOptions): Promise<AnchorWriteResult> {
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

  setTimeout(() => {
    try {
      urlApi.revokeObjectURL(objectUrl);
    } catch {
      /* ignore */
    }
  }, REVOKE_DELAY_MS);

  document.body?.appendChild(a);
  // FileSaver.js Path A blob branch uses `setTimeout(click, 0)` here. Older
  // WebKit dropped immediate clicks on a freshly-minted blob: URL — letting
  // the current task complete before dispatching gives the URL time to
  // register in the browser's blob registry.
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      try {
        clickAnchor(a);
      } finally {
        document.body?.removeChild(a);
        resolve();
      }
    }, 0);
  });

  return { bytes: opts.blob.size };
}
