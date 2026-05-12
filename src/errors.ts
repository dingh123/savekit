export class SaveError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'SaveError';
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class SaveAbortError extends SaveError {
  readonly reason: 'user' | 'signal';

  constructor(reason: 'user' | 'signal', message?: string) {
    super(message ?? (reason === 'user' ? 'Save aborted by user' : 'Save aborted by signal'));
    this.name = 'SaveAbortError';
    this.reason = reason;
  }
}

export class SaveDownloadError extends SaveError {
  readonly url: string;
  readonly status?: number;

  constructor(url: string, status: number | undefined, message?: string) {
    super(
      message ??
        (status !== undefined
          ? `Failed to download "${url}" (HTTP ${status})`
          : `Failed to download "${url}"`),
    );
    this.name = 'SaveDownloadError';
    this.url = url;
    this.status = status;
  }
}
