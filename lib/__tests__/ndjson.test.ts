import { describe, it, expect } from 'vitest';
import { parseNdjson } from '../ndjson';

function streamOf(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(typeof c === 'string' ? encoder.encode(c) : c);
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const v of parseNdjson(body)) out.push(v);
  return out;
}

describe('parseNdjson', () => {
  it('yields one value per newline-terminated line', async () => {
    expect(await collect(streamOf(['{"a":1}\n{"b":2}\n']))).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('reassembles a line split across chunks, including mid-codepoint UTF-8 splits', async () => {
    const bytes = new TextEncoder().encode('{"title":"café"}\n');
    const cut = 12; // inside the multi-byte "é"
    expect(await collect(streamOf([bytes.slice(0, cut), bytes.slice(cut)]))).toEqual([{ title: 'café' }]);
  });

  it('yields a trailing value even without a final newline', async () => {
    expect(await collect(streamOf(['{"a":1}\n{"done":true}']))).toEqual([{ a: 1 }, { done: true }]);
  });

  it('skips blank and malformed lines instead of aborting the stream', async () => {
    expect(await collect(streamOf(['\n{"a":1}\n', 'not json\n', '{"b":2}\n']))).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
