import { NextResponse } from 'next/server';
import { runFinder } from '../../../../lib/finder';
import { clientIp, rateLimit } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = 32_000; // a product name or short description is tiny; reject abuse early

/**
 * Streaming twin of POST /api/find: the same hardened prelude, then the
 * finder's narration events as NDJSON lines ('status', 'offers', then a final
 * 'done' carrying the exact FinderResult the JSON route would have returned).
 */
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
  const q = query.slice(0, 400);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // enqueue throws once the client disconnects; swallowing it lets the
      // finder run to completion instead of surfacing a spurious error.
      const send = (e: unknown): void => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
        } catch { /* client went away */ }
      };
      try {
        // runFinder emits 'done' itself; every event goes straight to the wire.
        await runFinder(q, { onEvent: send });
      } catch {
        // runFinder degrades internally; this guard should never fire.
        send({ type: 'error', message: 'internal' });
      }
      try {
        controller.close();
      } catch { /* already closed by cancellation */ }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      // Tell any fronting proxy not to buffer: the narration must arrive live.
      'x-accel-buffering': 'no',
    },
  });
}
