import { describe, expect, it } from 'vitest';
import {
  extensionFromMime,
  hasExtension,
  resolveFilename,
  sanitizeFilename,
} from '../src/filename.js';

describe('sanitizeFilename', () => {
  it('replaces Windows illegal characters with underscore', () => {
    expect(sanitizeFilename('a\\b/c:d*e?f"g<h>i|j.txt')).toBe('a_b_c_d_e_f_g_h_i_j.txt');
  });

  it('strips control characters', () => {
    expect(sanitizeFilename('hello\x00world\x1f.txt')).toBe('helloworld.txt');
  });

  it('trims whitespace and trailing dots', () => {
    expect(sanitizeFilename('  report.pdf  ')).toBe('report.pdf');
    expect(sanitizeFilename('report.pdf...')).toBe('report.pdf');
    expect(sanitizeFilename('report.pdf. . .')).toBe('report.pdf');
  });

  it('falls back to "download" for empty or fully-illegal input', () => {
    expect(sanitizeFilename('')).toBe('download');
    expect(sanitizeFilename('   ')).toBe('download');
    expect(sanitizeFilename('///')).toBe('download');
  });

  it('truncates long names while preserving short extensions', () => {
    const long = `${'a'.repeat(300)}.txt`;
    const result = sanitizeFilename(long);
    expect(result).toHaveLength(255);
    expect(result.endsWith('.txt')).toBe(true);
  });

  it('truncates without extension when ext too long', () => {
    const long = `${'a'.repeat(260)}.verylongextension`;
    const result = sanitizeFilename(long);
    expect(result).toHaveLength(255);
  });

  it('preserves unicode characters', () => {
    expect(sanitizeFilename('报告_2026.pdf')).toBe('报告_2026.pdf');
  });
});

describe('extensionFromMime', () => {
  it('maps common MIME types', () => {
    expect(extensionFromMime('text/plain')).toBe('txt');
    expect(extensionFromMime('application/json')).toBe('json');
    expect(extensionFromMime('image/png')).toBe('png');
  });

  it('ignores parameters and case', () => {
    expect(extensionFromMime('Text/Plain;charset=UTF-8')).toBe('txt');
  });

  it('returns undefined for unknown or empty MIME', () => {
    expect(extensionFromMime('application/x-unknown')).toBeUndefined();
    expect(extensionFromMime(undefined)).toBeUndefined();
    expect(extensionFromMime('')).toBeUndefined();
  });
});

describe('hasExtension', () => {
  it('detects normal extensions', () => {
    expect(hasExtension('report.pdf')).toBe(true);
    expect(hasExtension('archive.tar.gz')).toBe(true);
  });

  it('rejects dotfiles and trailing dot', () => {
    expect(hasExtension('.gitignore')).toBe(false);
    expect(hasExtension('file.')).toBe(false);
    expect(hasExtension('noext')).toBe(false);
  });
});

describe('resolveFilename', () => {
  it('uses explicit when provided', () => {
    expect(resolveFilename('a.txt', 'b.txt', undefined)).toBe('a.txt');
  });

  it('falls back to fallback when explicit missing', () => {
    expect(resolveFilename(undefined, 'b.txt', undefined)).toBe('b.txt');
  });

  it('appends MIME-derived extension when missing', () => {
    expect(resolveFilename('report', undefined, 'application/pdf')).toBe('report.pdf');
  });

  it('does not append extension if one already exists', () => {
    expect(resolveFilename('report.txt', undefined, 'application/pdf')).toBe('report.txt');
  });

  it('uses default name when nothing provided', () => {
    expect(resolveFilename(undefined, undefined, undefined)).toBe('download');
  });
});
