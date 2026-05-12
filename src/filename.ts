const ILLEGAL_CHARS = /[\\/:*?"<>|]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — strip control chars from filenames
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;
const MAX_LENGTH = 255;
const DEFAULT_NAME = 'download';

const MIME_TO_EXT: Record<string, string> = {
  'text/plain': 'txt',
  'text/html': 'html',
  'text/css': 'css',
  'text/javascript': 'js',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'text/xml': 'xml',
  'application/json': 'json',
  'application/xml': 'xml',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/gzip': 'gz',
  'application/x-tar': 'tar',
  'application/octet-stream': 'bin',
  'application/wasm': 'wasm',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export function sanitizeFilename(name: string): string {
  // If the input is entirely illegal/control/whitespace, fall back early instead of returning "___".
  const meaningful = name
    .replace(ILLEGAL_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(/[. ]/g, '');
  if (meaningful.length === 0) return DEFAULT_NAME;

  let cleaned = name.replace(ILLEGAL_CHARS, '_').replace(CONTROL_CHARS, '').trim();
  // Strip trailing dots and spaces (Windows hates them)
  cleaned = cleaned.replace(/[. ]+$/, '');
  if (cleaned.length === 0) return DEFAULT_NAME;
  if (cleaned.length > MAX_LENGTH) {
    const dotIndex = cleaned.lastIndexOf('.');
    if (dotIndex > 0 && cleaned.length - dotIndex <= 10) {
      const ext = cleaned.slice(dotIndex);
      cleaned = cleaned.slice(0, MAX_LENGTH - ext.length) + ext;
    } else {
      cleaned = cleaned.slice(0, MAX_LENGTH);
    }
  }
  return cleaned;
}

export function extensionFromMime(mimeType: string | undefined): string | undefined {
  if (!mimeType) return undefined;
  const base = mimeType.split(';')[0]?.trim().toLowerCase();
  if (!base) return undefined;
  return MIME_TO_EXT[base];
}

export function hasExtension(name: string): boolean {
  const idx = name.lastIndexOf('.');
  return idx > 0 && idx < name.length - 1 && idx > name.lastIndexOf('/');
}

export function resolveFilename(
  explicit: string | undefined,
  fallback: string | undefined,
  mimeType: string | undefined,
): string {
  const raw = explicit ?? fallback ?? DEFAULT_NAME;
  const sanitized = sanitizeFilename(raw);
  if (hasExtension(sanitized)) return sanitized;
  const ext = extensionFromMime(mimeType);
  return ext ? `${sanitized}.${ext}` : sanitized;
}
