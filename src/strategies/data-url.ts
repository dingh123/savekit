import { getBlobUrlApi } from '../env.js';
import { SaveError } from '../errors.js';
import type { UaFlags } from '../ua.js';

const REVOKE_DELAY_MS = 40_000;

export interface DataUrlWriteOptions {
  blob: Blob;
  /**
   * Optional pre-opened popup window (created synchronously in `save()` to
   * avoid popup blockers). When present, the resulting URL is loaded into
   * the popup instead of replacing the current page.
   */
  popup?: Window | null;
  /** UA flags from `detectUa()`. Decides FileReader vs blob URL navigation. */
  ua?: UaFlags;
}

export interface DataUrlWriteResult {
  bytes: number;
}

/**
 * Fallback path mirroring the original FileSaver.js popup-based saveAs.
 *
 *  - Chrome iOS, Safari + `application/octet-stream`, and macOS WebView need a
 *    FileReader → data URL because they will not download from blob URLs.
 *  - Everything else falling into this strategy gets a blob URL navigation
 *    instead (cheaper, no base64 inflation).
 *
 * Either result is loaded into the supplied popup window (preferred) or the
 * current `location` (last resort, will navigate away).
 */
export async function writeViaDataUrl(opts: DataUrlWriteOptions): Promise<DataUrlWriteResult> {
  if (typeof location === 'undefined') {
    throw new SaveError('location is not available; cannot use data-url strategy');
  }

  const popup = opts.popup ?? null;
  const ua = opts.ua;
  const force = opts.blob.type === 'application/octet-stream';
  const needsFileReader = !!ua && (ua.isChromeIOS || (force && ua.isSafari) || ua.isMacOSWebView);

  if (needsFileReader) {
    if (typeof FileReader === 'undefined') {
      throw new SaveError('FileReader is not available; cannot use data-url strategy');
    }

    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const r = reader.result;
        if (typeof r === 'string') resolve(r);
        else reject(new SaveError('FileReader did not return a data URL string'));
      };
      reader.onerror = () => reject(new SaveError('FileReader failed', { cause: reader.error }));
      reader.readAsDataURL(opts.blob);
    });

    // Chrome iOS handles `data:` URLs natively; other browsers need the MIME
    // rewritten so they treat the URL as a download instead of inline content.
    const url = ua?.isChromeIOS
      ? dataUrl
      : dataUrl.replace(/^data:[^;]*;/, 'data:attachment/file;');

    if (popup) popup.location.href = url;
    else location.href = url;

    return { bytes: opts.blob.size };
  }

  // Blob URL navigation path.
  const urlApi = getBlobUrlApi();
  const objectUrl = urlApi.createObjectURL(opts.blob);
  if (popup) popup.location.href = objectUrl;
  else location.href = objectUrl;

  setTimeout(() => {
    try {
      urlApi.revokeObjectURL(objectUrl);
    } catch {
      /* ignore */
    }
  }, REVOKE_DELAY_MS);

  return { bytes: opts.blob.size };
}
