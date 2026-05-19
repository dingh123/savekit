export function isSameOrigin(url: string): boolean {
  if (typeof location === 'undefined' || typeof document === 'undefined') {
    // Not a browser context — caller should not be using anchor strategies anyway.
    return true;
  }
  try {
    const a = document.createElement('a');
    a.href = url;
    if (!a.origin || a.origin === 'null') {
      // Relative URLs resolve against location.origin → same-origin by definition.
      return true;
    }
    return a.origin === location.origin;
  } catch {
    return false;
  }
}

/**
 * Synchronous HEAD probe used to decide whether a cross-origin URL can be
 * fetched as a Blob. Sync XHR is intentional — matches the original
 * FileSaver.js, which used it to avoid popup blockers that fire when async
 * work happens between the user click and the eventual download.
 */
export function corsEnabled(url: string): boolean {
  if (typeof XMLHttpRequest === 'undefined') return false;
  const xhr = new XMLHttpRequest();
  try {
    xhr.open('HEAD', url, false);
    xhr.send();
  } catch {
    /* CORS rejection / network error → status stays 0 */
  }
  return xhr.status >= 200 && xhr.status <= 299;
}
