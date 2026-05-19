/**
 * `a.click()` is unreliable in some browsers (notably older Safari and
 * embedded WebViews) — dispatch a synthesized MouseEvent and fall back to
 * the legacy `createEvent` API on environments that reject the constructor.
 * Mirrors the FileSaver.js `click()` helper.
 */
export function clickAnchor(node: HTMLAnchorElement): void {
  try {
    node.dispatchEvent(new MouseEvent('click'));
  } catch {
    // biome-ignore lint/suspicious/noExplicitAny: legacy DOM API
    const doc = document as any;
    const evt = doc.createEvent('MouseEvents');
    evt.initMouseEvent(
      'click',
      true,
      true,
      window,
      0,
      0,
      0,
      80,
      20,
      false,
      false,
      false,
      false,
      0,
      null,
    );
    node.dispatchEvent(evt);
  }
}
