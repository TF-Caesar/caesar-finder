import { NextResponse } from 'next/server';
import { runFinder } from '../../../lib/finder';
import { clientIp, rateLimit } from '../../../lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = 32_000; // a product name or short description is tiny; reject abuse early

export async function POST(req: Request) {
  // Rate-limit before any Caesar work: one POST fans out to several searches/reads.
  const decision = rateLimit(clientIp(req));
  if (!decision.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSeconds: decision.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds ?? 60) } },
    );
  }
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'body_too_large' }, { status: 413 });
  }
  // Also cap the actual body (in bytes, matching the name): chunked / missing
  // Content-Length bypasses the header check.
  let raw = '';
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'body_too_large' }, { status: 413 });
  }
  // Known-garbage input never reaches Caesar: reject it here instead of spending quota.
  let query: unknown;
  try {
    query = JSON.parse(raw)?.query;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (typeof query !== 'string' || query.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  try {
    const result = await runFinder(query.slice(0, 400));
    return NextResponse.json(result, { status: 200 });
  } catch {
    // runFinder already degrades internally; this guard should never fire.
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
