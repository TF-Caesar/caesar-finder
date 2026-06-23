import { describe, it, expect } from 'vitest';
import { isSafeReadUrl, safeExternalUrl } from '../url';

describe('isSafeReadUrl', () => {
  it('accepts a public bare http(s) URL', () => {
    expect(isSafeReadUrl('https://en.wikipedia.org/wiki/X')).toBe(true);
    expect(isSafeReadUrl('http://example.com/a?b=1')).toBe(true);
  });
  it('rejects non-http(s) protocols and non-URLs', () => {
    expect(isSafeReadUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeReadUrl('ftp://example.com')).toBe(false);
    expect(isSafeReadUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeReadUrl('not a url')).toBe(false);
    expect(isSafeReadUrl('see https://x.com here')).toBe(false); // not bare
  });
  it('blocks loopback, private, link-local and metadata hosts', () => {
    for (const u of [
      'http://localhost/x',
      'http://127.0.0.1/',
      'http://0.0.0.0/',
      'http://10.1.2.3/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'http://169.254.169.254/latest/meta-data/', // cloud metadata
      'https://metadata.google.internal/computeMetadata/v1/',
      'http://[::1]/',
      'http://service.local/',
    ]) {
      expect(isSafeReadUrl(u), u).toBe(false);
    }
  });
});

describe('safeExternalUrl', () => {
  it('returns http(s) URLs (normalized)', () => {
    expect(safeExternalUrl('https://x.com/a')).toBe('https://x.com/a');
    expect(safeExternalUrl('http://x.com')).toBe('http://x.com/');
  });
  it('returns null for dangerous or invalid hrefs', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,<script>')).toBeNull();
    expect(safeExternalUrl('not a url')).toBeNull();
    expect(safeExternalUrl('')).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});
