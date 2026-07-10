import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchMock = vi.fn();
const readMock = vi.fn();
vi.mock('caesar-search', () => ({
  Caesar: vi.fn().mockImplementation(() => ({ search: searchMock, read: readMock })),
}));

import { CaesarClient } from '../caesar';

beforeEach(() => { searchMock.mockReset(); readMock.mockReset(); });

describe('CaesarClient.search', () => {
  it('normalizes snake_case results to camelCase', async () => {
    searchMock.mockResolvedValue({ search_id: 's1', results: [{ rank: 1, title: 'T', canonical_url: 'https://x.com/a', doc_id: 'd1', snippet: 'snip' }] });
    const r = await new CaesarClient().search('q', { maxResults: 5 });
    expect(r.searchId).toBe('s1');
    expect(r.results[0]).toEqual({ rank: 1, title: 'T', canonicalUrl: 'https://x.com/a', docId: 'd1', snippet: 'snip' });
  });
  it('passes domain + freshness filters via extraBody', async () => {
    searchMock.mockResolvedValue({ results: [] });
    await new CaesarClient().search('q', { includeDomains: ['a.com'], publishedAfter: '2026-01-01' });
    const [, opts] = searchMock.mock.calls[0];
    expect(opts.extraBody.source_policy.include_domains).toEqual(['a.com']);
    expect(opts.extraBody.freshness_policy.published_after).toBe('2026-01-01');
  });
  it('passes query rewrites via extraBody.search_queries and maps the serving index', async () => {
    searchMock.mockResolvedValue({ results: [{ rank: 1, title: 'T', canonical_url: 'https://x.com/a', doc_id: 'd1', snippet: 's', index: 'web' }] });
    const r = await new CaesarClient().search('sony wh-1000xm5', { searchQueries: ['sony wh-1000xm5 buy', 'sony wh-1000xm5 price'] });
    const [q, opts] = searchMock.mock.calls[0];
    expect(q).toBe('sony wh-1000xm5'); // the original query still drives reranking + passage selection
    expect(opts.extraBody.search_queries).toEqual(['sony wh-1000xm5 buy', 'sony wh-1000xm5 price']);
    expect(r.results[0].index).toBe('web');
  });
});

describe('CaesarClient.read', () => {
  it('returns text, passages, and provenance', async () => {
    readMock.mockResolvedValue({
      doc: { doc_id: 'd1', canonical_url: 'https://x.com/a' },
      content: { text: 'full text' },
      passages: [{ passage_id: 'p1', text: 'a passage' }],
      provenance: { capture_id: 'cap1', capture_time: '2026-06-21T14:03:00Z' },
    });
    const d = await new CaesarClient().read('https://x.com/a', { query: 'q' });
    expect(d.text).toBe('full text');
    expect(d.passages[0]).toEqual({ passageId: 'p1', text: 'a passage' });
    expect(d.captureTime).toBe('2026-06-21T14:03:00Z');
  });
  it('includeCaptureHistory rides on the same call and maps the newest-first timeline', async () => {
    readMock.mockResolvedValue({
      doc: { doc_id: 'd1', canonical_url: 'https://x.com/a' },
      content: { text: 'body' },
      passages: [{ passage_id: 'p1', text: 'a passage', char_start: 120, char_end: 240, section_heading: 'Specs' }],
      provenance: { capture_id: 'cap2', capture_time: 't2' },
      capture_history: [
        { capture_id: 'cap2', capture_time: 't2', content_digest: 'sha-2' },
        { capture_id: 'cap1', capture_time: 't1' },
      ],
    });
    const d = await new CaesarClient().read('https://x.com/a', { includeCaptureHistory: true });
    const [, opts] = readMock.mock.calls[0];
    expect(opts.include).toContain('capture_history');
    expect(d.captureHistory).toEqual([
      { captureId: 'cap2', captureTime: 't2', contentDigest: 'sha-2' },
      { captureId: 'cap1', captureTime: 't1' },
    ]);
    expect(d.passages[0]).toMatchObject({ charStart: 120, charEnd: 240, sectionHeading: 'Specs' });
  });
  it('omits offsets when a capture has none (best-effort: absent on a first-ever capture)', async () => {
    readMock.mockResolvedValue({ content: { text: 'body' }, passages: [{ passage_id: 'p1', text: 'a passage' }] });
    const d = await new CaesarClient().read('https://x.com/a');
    expect(d.passages[0]).not.toHaveProperty('charStart');
    expect(d.passages[0]).not.toHaveProperty('sectionHeading');
    expect(d.captureHistory).toBeUndefined(); // not asked for: not returned
  });
});

describe('CaesarClient.searchAndRead', () => {
  it('assembles citations with passages + provenance', async () => {
    searchMock.mockResolvedValue({ search_id: 's1', results: [{ rank: 1, title: 'T1', canonical_url: 'https://x.com/1', doc_id: 'd1', snippet: 's1' }] });
    readMock.mockResolvedValue({
      doc: { doc_id: 'd1', canonical_url: 'https://x.com/1' },
      content: { text: 'long body '.repeat(40) },
      passages: [{ passage_id: 'p1', text: 'cited passage' }],
      provenance: { capture_id: 'cap1', capture_time: '2026-06-21T14:03:00Z' },
    });
    const r = await new CaesarClient().searchAndRead('q', { readTopN: 1 });
    expect(r.citations[0].passage).toBe('cited passage');
    expect(r.citations[0].captureTime).toBe('2026-06-21T14:03:00Z');
    expect(r.evidence).toContain('https://x.com/1');
  });
  it('tolerates a read failure without throwing', async () => {
    searchMock.mockResolvedValue({ results: [{ rank: 1, title: 'T', canonical_url: 'https://x.com/1', doc_id: 'd1', snippet: 'snip' }] });
    readMock.mockRejectedValue(new Error('429'));
    const r = await new CaesarClient().searchAndRead('q', { readTopN: 1 });
    expect(r.citations[0].canonicalUrl).toBe('https://x.com/1');
    expect(r.citations[0].passage).toBeUndefined();
  });

  it('minScore drops null/missing-score and low-score results, keeps scored ones', async () => {
    searchMock.mockResolvedValue({ search_id: 's1', results: [
      { rank: 1, title: 'good', canonical_url: 'https://a.com', doc_id: 'd1', snippet: 's', score: { value: 0.9 } },
      { rank: 2, title: 'unscored (gibberish)', canonical_url: 'https://b.com', doc_id: 'd2', snippet: 's' },
      { rank: 3, title: 'weak', canonical_url: 'https://c.com', doc_id: 'd3', snippet: 's', score: { value: 0.1 } },
    ] });
    readMock.mockResolvedValue({ doc: { doc_id: 'd1', canonical_url: 'https://a.com' }, content: { text: 'body' }, passages: [], provenance: { capture_id: 'c', capture_time: 't' } });
    const r = await new CaesarClient().searchAndRead('q', { readTopN: 5, minScore: 0.3 });
    expect(r.citations.map((c) => c.canonicalUrl)).toEqual(['https://a.com']);
  });

  it('carries passage offsets, serving index, and capture count onto the citation', async () => {
    searchMock.mockResolvedValue({ results: [{ rank: 1, title: 'T', canonical_url: 'https://x.com/1', doc_id: 'd1', snippet: 's', index: 'web' }] });
    readMock.mockResolvedValue({
      doc: { doc_id: 'd1', canonical_url: 'https://x.com/1' },
      content: { text: 'long body '.repeat(40) },
      passages: [{ passage_id: 'p1', text: 'the cited passage', char_start: 10, char_end: 27, section_heading: 'Overview' }],
      provenance: { capture_id: 'c', capture_time: 't' },
      capture_history: [{ capture_id: 'c', capture_time: 't' }, { capture_id: 'c0', capture_time: 't0' }],
    });
    const r = await new CaesarClient().searchAndRead('q', { readTopN: 1, includeCaptureHistory: true });
    expect(r.citations[0]).toMatchObject({
      passageId: 'p1', passageStart: 10, passageEnd: 27, passageSection: 'Overview', index: 'web', captureCount: 2,
    });
  });

  it('keeps all results (including unscored) when no minScore is set', async () => {
    searchMock.mockResolvedValue({ results: [{ rank: 1, title: 'x', canonical_url: 'https://a.com', doc_id: 'd1', snippet: 's' }] });
    readMock.mockResolvedValue({ content: { text: '' }, passages: [] });
    const r = await new CaesarClient().searchAndRead('q', { readTopN: 5 });
    expect(r.citations).toHaveLength(1);
  });
});
