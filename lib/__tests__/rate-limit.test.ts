import { describe, it, expect, beforeEach } from 'vitest';
import { clientIp, rateLimit, resetRateLimiter } from '../rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it('allows a burst of 5 and denies the 6th', () => {
    const now = 1_750_000_000_000;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit('203.0.113.7', now).ok).toBe(true);
    }
    const denied = rateLimit('203.0.113.7', now);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('refills at 5 requests per minute (one token every 12s)', () => {
    const now = 1_750_000_000_000;
    for (let i = 0; i < 5; i++) rateLimit('203.0.113.7', now);
    expect(rateLimit('203.0.113.7', now).ok).toBe(false);
    expect(rateLimit('203.0.113.7', now + 12_000).ok).toBe(true);
    expect(rateLimit('203.0.113.7', now + 12_000).ok).toBe(false); // token spent again
  });

  it('tracks each IP independently', () => {
    const now = 1_750_000_000_000;
    for (let i = 0; i < 6; i++) rateLimit('203.0.113.7', now);
    expect(rateLimit('203.0.113.7', now).ok).toBe(false);
    expect(rateLimit('198.51.100.9', now).ok).toBe(true);
  });
});

describe('clientIp', () => {
  it('prefers fly-client-ip, then the first x-forwarded-for hop, then unknown', () => {
    expect(clientIp(new Request('http://x.test', { headers: { 'fly-client-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.9' } }))).toBe('203.0.113.7');
    expect(clientIp(new Request('http://x.test', { headers: { 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1' } }))).toBe('203.0.113.7');
    expect(clientIp(new Request('http://x.test'))).toBe('unknown');
  });
});
