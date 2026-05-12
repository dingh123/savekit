import { SaveAbortError, type SaveProgressEvent, save } from '../src/index.js';

function log(targetId: string, msg: string): void {
  const el = document.getElementById(targetId);
  if (!el) return;
  const time = new Date().toLocaleTimeString();
  el.textContent += `[${time}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

function setBar(barId: string, ratio: number): void {
  const el = document.getElementById(barId);
  if (el) el.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
}

function bind(id: string, handler: (btn: HTMLButtonElement) => Promise<void>): void {
  const btn = document.getElementById(id) as HTMLButtonElement | null;
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await handler(btn);
    } finally {
      btn.disabled = false;
    }
  });
}

bind('btn-text', async () => {
  await save('hello, world\n你好，世界', {
    filename: 'hello.txt',
    autoBom: true,
    mimeType: 'text/plain;charset=utf-8',
    onStart: (info) => log('log-text', `start: ${info.method} → ${info.filename}`),
    onSuccess: (r) =>
      log('log-text', `success: ${r.bytes} bytes via ${r.method} in ${r.durationMs}ms`),
    onError: (e) => log('log-text', `error: ${e.message}`),
    onAbort: () => log('log-text', 'aborted'),
  });
});

bind('btn-blob', async () => {
  const blob = new Blob([JSON.stringify({ hello: 'world', n: 42 }, null, 2)], {
    type: 'application/json',
  });
  await save(blob, {
    filename: 'data.json',
    onStart: (info) => log('log-blob', `start: ${info.method} → ${info.filename}`),
    onSuccess: (r) => log('log-blob', `success: ${r.bytes} bytes via ${r.method}`),
    onError: (e) => log('log-blob', `error: ${e.message}`),
  });
});

let remoteCtrl: AbortController | null = null;
bind('btn-remote', async () => {
  const url = (document.getElementById('remote-url') as HTMLInputElement).value;
  remoteCtrl = new AbortController();
  const abortBtn = document.getElementById('btn-remote-abort') as HTMLButtonElement;
  abortBtn.disabled = false;
  setBar('bar-remote', 0);
  try {
    await save(
      { url },
      {
        signal: remoteCtrl.signal,
        onStart: (info) => log('log-remote', `start: ${info.method}, total=${info.total ?? '?'}`),
        onProgress: (e: SaveProgressEvent) => {
          if (e.phase === 'downloading' && e.total) {
            setBar('bar-remote', e.loaded / e.total);
          }
        },
        onSuccess: (r) => {
          log('log-remote', `success: ${r.bytes} bytes via ${r.method}`);
          setBar('bar-remote', 1);
        },
        onError: (e) => log('log-remote', `error: ${e.message}`),
        onAbort: () => log('log-remote', 'aborted by user'),
      },
    );
  } catch (e) {
    if (!(e instanceof SaveAbortError)) throw e;
  } finally {
    abortBtn.disabled = true;
    remoteCtrl = null;
  }
});

bind('btn-remote-abort', async () => {
  remoteCtrl?.abort();
});

bind('btn-large', async () => {
  const CHUNK = 256 * 1024;
  const TOTAL_CHUNKS = 40; // 10 MB
  let emitted = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (emitted >= TOTAL_CHUNKS) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(CHUNK));
      emitted += 1;
    },
  });
  setBar('bar-large', 0);
  await save(stream, {
    filename: 'large.bin',
    mimeType: 'application/octet-stream',
    onStart: (info) => log('log-large', `start: ${info.method}`),
    onProgress: (e) => {
      if (e.phase === 'writing') {
        const total = CHUNK * TOTAL_CHUNKS;
        setBar('bar-large', e.loaded / total);
      }
    },
    onSuccess: (r) => {
      log('log-large', `success: ${r.bytes} bytes via ${r.method}`);
      setBar('bar-large', 1);
    },
    onError: (e) => log('log-large', `error: ${e.message}`),
    onAbort: () => log('log-large', 'aborted'),
  });
});

bind('btn-anchor', async () => {
  await save('forced via <a download>', {
    filename: 'forced.txt',
    preferFilePicker: false,
    onSuccess: (r) => log('log-anchor', `success via ${r.method}, ${r.bytes} bytes`),
    onError: (e) => log('log-anchor', `error: ${e.message}`),
  });
});

bind('btn-picker', async () => {
  await save('content picked via showSaveFilePicker', {
    filename: 'picked.txt',
    preferFilePicker: true,
    pickerTypes: [
      {
        description: 'Text file',
        accept: { 'text/plain': ['.txt'] },
      },
    ],
    onStart: (info) => log('log-picker', `start: ${info.method}`),
    onSuccess: (r) => log('log-picker', `success: ${r.bytes} bytes via ${r.method}`),
    onError: (e) => log('log-picker', `error: ${e.message}`),
    onAbort: () => log('log-picker', 'user cancelled picker'),
  });
});
