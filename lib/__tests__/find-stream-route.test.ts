import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetRateLimiter } from '../rate-limit';
import { parseNdjson } from '../ndjson';
import { runFinder } from '../finder';
import type { FinderResult } from '../finder';
import { POST } from '../../app/api/find/stream/route';

vi.mock('../finder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../finder')>();
  return { ...actual, runFinder: vi.fn() };
});

const mockedRun = vi.mocked(runFinder);

beforeEach(() => {
  resetRateLimiter();
  mockedRun.mockReset();
});

const RESULT: FinderResult = { query: 'sony wh-1000xm5', topMatch: 'Sony WH-1000XM5', offers: [], degraded: false };

function post(body: BodyInit, ip = '1.2.3.4', headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/find/stream', {
    method: 'POST',
    headers: { 'fly-client-ip': ip, 'content-type': 'application/json', ...headers },
    body,
  });
}

async function events(res: Response): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const e of parseNdjson(res.body!)) out.push(e);
  return out;
}

describe('POST /api/find/stream', () => {
  it('streams the finder events as NDJSON lines, ending with done', async () => {
    mockedRun.mockImplementation(async (query, deps) => {
      deps?.onEvent?.({ type: 'status', stage: 'searching', query });
      deps?.onEvent?.({ type: 'done', result: RESULT });
      return RESULT;
    });
    const res = await POST(post(JSON.stringify({ query: 'sony wh-1000xm5' })));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('ndjson');
    expect(await events(res)).toEqual([
      { type: 'status', stage: 'searching', query: 'sony wh-1000xm5' },
      { type: 'done', result: RESULT },
    ]);
    expect(mockedRun).toHaveBeenCalledWith('sony wh-1000xm5', expect.objectContaining({ onEvent: expect.any(Function) }));
  });

  it('emits an error event mid-stream (still HTTP 200) if the finder itself throws', async () => {
    mockedRun.mockRejectedValue(new Error('boom'));
    const res = await POST(post(JSON.stringify({ query: 'sony' })));
    expect(res.status).toBe(200);
    const lines = await events(res);
    expect(lines.at(-1)).toEqual({ type: 'error', message: 'internal' });
  });

  it('rejects an empty query with 400 before any Caesar work', async () => {
    const res = await POST(post(JSON.stringify({ query: '   ' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_query');
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await POST(post('not json'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_json');
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it('rejects an oversized chunked body (no Content-Length) with 413', async () => {
    const big = JSON.stringify({ query: 'x'.repeat(40_000) });
    const req = new Request('http://localhost/api/find/stream', {
      method: 'POST',
      headers: { 'fly-client-ip': '1.2.3.4' },
      body: new Blob([big]).stream(),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('body_too_large');
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it('returns 429 with Retry-After on the 6th rapid request from one IP', async () => {
    mockedRun.mockResolvedValue(RESULT);
    for (let i = 0; i < 5; i++) {
      expect((await POST(post(JSON.stringify({ query: 'sony' }), '7.7.7.7'))).status).toBe(200);
    }
    const res = await POST(post(JSON.stringify({ query: 'sony' }), '7.7.7.7'));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
    expect((await res.json()).error).toBe('rate_limited');
  });
});
