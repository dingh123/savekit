import { SaveError } from '../errors.js';

export interface DataUrlWriteOptions {
  blob: Blob;
}

export interface DataUrlWriteResult {
  bytes: number;
}

export async function writeViaDataUrl(opts: DataUrlWriteOptions): Promise<DataUrlWriteResult> {
  if (typeof FileReader === 'undefined') {
    throw new SaveError('FileReader is not available; cannot use data-url strategy');
  }
  if (typeof location === 'undefined') {
    throw new SaveError('location is not available; cannot use data-url strategy');
  }

  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new SaveError('FileReader did not return a data URL string'));
    };
    reader.onerror = () => reject(new SaveError('FileReader failed', { cause: reader.error }));
    reader.readAsDataURL(opts.blob);
  });

  // Force the browser to treat the URL as a download by switching the media type
  const url = dataUrl.replace(/^data:[^;]*;/, 'data:attachment/file;');
  location.href = url;

  return { bytes: opts.blob.size };
}
