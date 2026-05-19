export type SaveData =
  | Blob
  | File
  | ArrayBuffer
  | ArrayBufferView
  | ReadableStream<Uint8Array>
  | { url: string }
  | string;

export type SaveMethod =
  | 'file-system-access'
  | 'anchor-download'
  | 'anchor-navigate'
  | 'ms-save-blob'
  | 'data-url';

export type SavePhase = 'normalizing' | 'downloading' | 'picking' | 'writing' | 'done';

export interface SaveProgressEvent {
  loaded: number;
  total?: number;
  phase: SavePhase;
}

export interface SaveStartInfo {
  filename: string;
  method: SaveMethod;
  total?: number;
}

export interface SaveResult {
  filename: string;
  bytes: number;
  method: SaveMethod;
  aborted: boolean;
  durationMs: number;
}

export interface SaveOptions {
  filename?: string;
  mimeType?: string;
  autoBom?: boolean;
  signal?: AbortSignal;
  preferFilePicker?: boolean;
  pickerTypes?: FilePickerAcceptType[];

  onStart?: (info: SaveStartInfo) => void;
  onProgress?: (event: SaveProgressEvent) => void;
  onSuccess?: (result: SaveResult) => void;
  onError?: (error: Error) => void;
  onAbort?: () => void;
}

export interface NormalizedSource {
  blob?: Blob;
  stream?: ReadableStream<Uint8Array>;
  totalBytes?: number;
  suggestedMime?: string;
  /** Fallback filename inferred from the source (e.g. File.name). */
  suggestedName?: string;
  remoteUrl?: string;
}
