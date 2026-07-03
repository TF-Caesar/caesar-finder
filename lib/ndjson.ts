// Minimal NDJSON (newline-delimited JSON) consumption for streamed API
// responses. Dependency-free and tolerant by design: a malformed or blank
// line is skipped, never fatal, because losing one narration event should
// not kill the whole stream.

/**
 * Parse an NDJSON byte stream into a sequence of JSON values, one per line.
 * Buffers across chunk boundaries (TextDecoder in streaming mode, so a
 * multi-byte character split across chunks survives) and yields a trailing
 * line even when the stream ends without a final newline.
 */
export async function* parseNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line);
        } catch { /* skip a malformed line rather than abort the stream */ }
      }
      if (done) break;
    }
    const tail = buffer.trim();
    if (tail) {
      try {
        yield JSON.parse(tail);
      } catch { /* ditto for a malformed trailing line */ }
    }
  } finally {
    reader.releaseLock();
  }
}
