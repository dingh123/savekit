export interface UaFlags {
  isMacOSWebView: boolean;
  isSafari: boolean;
  isChromeIOS: boolean;
}

export function detectUa(): UaFlags {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const ua = nav?.userAgent ?? '';

  const isMacOSWebView =
    !!nav && /Macintosh/.test(ua) && /AppleWebKit/.test(ua) && !/Safari/.test(ua);

  // Mirrors the original FileSaver.js Safari detection.
  // biome-ignore lint/suspicious/noExplicitAny: probing legacy globals
  const g = globalThis as any;
  const isSafari =
    (typeof g.HTMLElement !== 'undefined' && /constructor/i.test(String(g.HTMLElement))) ||
    !!g.safari;

  const isChromeIOS = /CriOS\/[\d]+/.test(ua);

  return { isMacOSWebView, isSafari, isChromeIOS };
}
