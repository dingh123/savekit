const UTF8_BOM = '﻿';

const BOM_NEEDED_MIME =
  /^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i;

export function shouldInjectBom(mimeType: string | undefined, autoBom: boolean): boolean {
  if (!autoBom) return false;
  if (!mimeType) return false;
  return BOM_NEEDED_MIME.test(mimeType);
}

export function withBom(blob: Blob): Blob {
  return new Blob([UTF8_BOM, blob], { type: blob.type });
}

export function maybeAddBom(blob: Blob, autoBom: boolean): Blob {
  return shouldInjectBom(blob.type, autoBom) ? withBom(blob) : blob;
}
