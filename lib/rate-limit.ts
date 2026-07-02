// Dependency-free in-memory rate limiter for the public demo API routes.
//
// One anonymous POST fans out to several Caesar searches and reads, so an
// unthrottled loop can drain the shared quota and silently push every real
// visitor onto the demo fallback. A small token bucket per client IP keeps the
// demo honest and turns abuse into a clear 429 instead of degraded results.
//
// In-memory is deliberate: these demos run as a single Fly machine, and losing
// counters on restart is fine for a demo tier. If the app ever scales out,
// move this to something shared (Redis, upstream limiter) — do not fan out.

interface Bucket { tokens: number; last: number; }

const CAPACITY = 5;                 // burst allowance per IP
const REFILL_PER_MS = 5 / 60_000;   // steady-state: 5 requests per minute
const MAX_BUCKETS = 10_000;         // memory ceiling; prune oldest beyond this

const buckets = new Map<string, Bucket>();

/** Best-effort client IP: Fly sets fly-client-ip; fall back to the first XFF hop. */
export function clientIp(req: Request): string {
  return (
    req.headers.get('fly-client-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export interface RateLimitDecision {
  ok: boolean;
  /** Present when ok is false — seconds until a token is available. */
  retryAfterSeconds?: number;
}

export function rateLimit(ip: string, now: number = Date.now()): RateLimitDecision {
  let b = buckets.get(ip);
  if (!b) {
    if (buckets.size >= MAX_BUCKETS) prune(now);
    b = { tokens: CAPACITY, last: now };
    buckets.set(ip, b);
  } else {
    b.tokens = Math.min(CAPACITY, b.tokens + (now - b.last) * REFILL_PER_MS);
    b.last = now;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true };
  }
  return { ok: false, retryAfterSeconds: Math.ceil((1 - b.tokens) / REFILL_PER_MS / 1000) };
}

/** Drop buckets that have fully refilled (idle long enough to be indistinguishable from new). */
function prune(now: number): void {
  const idleMs = CAPACITY / REFILL_PER_MS;
  for (const [ip, b] of buckets) {
    if (now - b.last > idleMs) buckets.delete(ip);
  }
  // Pathological case (10k IPs all active inside one minute): drop oldest half.
  if (buckets.size >= MAX_BUCKETS) {
    const entries = [...buckets.entries()].sort((a, b) => a[1].last - b[1].last);
    for (const [ip] of entries.slice(0, entries.length / 2)) buckets.delete(ip);
  }
}

/** Test hook. */
export function resetRateLimiter(): void {
  buckets.clear();
}
