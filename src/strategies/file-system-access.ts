import { SaveAbortError, SaveError } from '../errors.js';

export interface FsaWriteOptions {
  filename: string;
  source: Blob | ReadableStream<Uint8Array>;
  totalBytes: number | undefined;
  pickerTypes?: FilePickerAcceptType[];
  signal?: AbortSignal;
  onPicking?: () => void;
  onWriting?: (loaded: number, total: number | undefined) => void;
}

export interface FsaWriteResult {
  bytes: number;
}

export async function writeViaFileSystemAccess(opts: FsaWriteOptions): Promise<FsaWriteResult> {
  if (typeof window === 'undefined' || typeof window.showSaveFilePicker !== 'function') {
    throw new SaveError('File System Access API is not available');
  }

  opts.onPicking?.();

  let handle: FileSystemFileHandle;
  try {
    const pickerOpts: SaveFilePickerOptions = { suggestedName: opts.filename };
    if (opts.pickerTypes && opts.pickerTypes.length > 0) {
      pickerOpts.types = opts.pickerTypes;
    }
    handle = await window.showSaveFilePicker(pickerOpts);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new SaveAbortError('user');
    }
    throw new SaveError('Failed to open save file picker', { cause: err });
  }

  if (opts.signal?.aborted) {
    throw new SaveAbortError('signal');
  }

  let writable: FileSystemWritableFileStream;
  try {
    writable = await handle.createWritable();
  } catch (err) {
    throw new SaveError('Failed to create writable stream', { cause: err });
  }

  let written = 0;
  try {
    if (opts.source instanceof Blob) {
      const reader = opts.source.stream().getReader();
      while (true) {
        if (opts.signal?.aborted) {
          await reader.cancel().catch(() => {});
          throw new SaveAbortError('signal');
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          await writable.write(value as unknown as FileSystemWriteChunkType);
          written += value.byteLength;
          opts.onWriting?.(written, opts.totalBytes ?? opts.source.size);
        }
      }
    } else {
      const reader = opts.source.getReader();
      while (true) {
        if (opts.signal?.aborted) {
          await reader.cancel().catch(() => {});
          throw new SaveAbortError('signal');
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          await writable.write(value as unknown as FileSystemWriteChunkType);
          written += value.byteLength;
          opts.onWriting?.(written, opts.totalBytes);
        }
      }
    }
    await writable.close();
  } catch (err) {
    try {
      await writable.abort();
    } catch {
      /* ignore */
    }
    if (err instanceof SaveAbortError) throw err;
    if ((err as Error)?.name === 'AbortError') throw new SaveAbortError('signal');
    throw new SaveError('Failed to write file', { cause: err });
  }

  return { bytes: written };
}
