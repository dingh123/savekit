import { clickAnchor } from '../dom.js';
import { SaveError } from '../errors.js';

export interface AnchorNavigateOptions {
  url: string;
  filename: string;
  newTab: boolean;
}

export interface AnchorNavigateResult {
  bytes: number;
}

/**
 * Direct anchor click for URL string sources — no Blob fetch.
 *
 * Two modes, both matching the original FileSaver.js behavior:
 *   - same-origin: anchor with `download=filename` → browser saves with that name
 *   - cross-origin without CORS: anchor with `target=_blank` → browser opens
 *     the URL in a new tab so it can apply its own Content-Disposition / save
 *     handling. The custom `filename` is ignored by the browser here (only the
 *     server's Content-Disposition matters) — this is the unavoidable trade-off
 *     when the response can't be read as a Blob.
 */
export function writeViaAnchorNavigate(opts: AnchorNavigateOptions): AnchorNavigateResult {
  if (typeof document === 'undefined') {
    throw new SaveError('document is not available; cannot use anchor-navigate strategy');
  }

  const a = document.createElementNS('http://www.w3.org/1999/xhtml', 'a') as HTMLAnchorElement;
  a.href = opts.url;
  a.download = opts.filename;
  a.rel = 'noopener';
  if (opts.newTab) a.target = '_blank';
  a.style.display = 'none';

  document.body?.appendChild(a);
  try {
    clickAnchor(a);
  } finally {
    document.body?.removeChild(a);
  }

  return { bytes: 0 };
}
