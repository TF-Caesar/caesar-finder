import { NextResponse } from 'next/server';
import { runFinder } from '../../../lib/finder';

export const runtime = 'nodejs';
export const maxDuration = 60;

const EMPTY = { query: '', offers: [], degraded: false };
const MAX_BODY_BYTES = 32_000; // a product name or short description is tiny; reject abuse early

export async function POST(req: Request) {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json(EMPTY, { status: 413 });
  }
  let query = '';
  try {
    query = (await req.json())?.query ?? '';
  } catch {
    query = '';
  }
  if (typeof query !== 'string' || query.trim().length === 0) {
    return NextResponse.json(EMPTY, { status: 200 });
  }
  try {
    const result = await runFinder(query.slice(0, 400));
    return NextResponse.json(result, { status: 200 });
  } catch {
    // runFinder already returns a baked demo on internal failure; last-resort guard.
    const result = await runFinder('');
    return NextResponse.json(result, { status: 200 });
  }
}
