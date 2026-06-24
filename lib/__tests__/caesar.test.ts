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

  it('keeps all results (including unscored) when no minScore is set', async () => {
    searchMock.mockResolvedValue({ results: [{ rank: 1, title: 'x', canonical_url: 'https://a.com', doc_id: 'd1', snippet: 's' }] });
    readMock.mockResolvedValue({ content: { text: '' }, passages: [] });
    const r = await new CaesarClient().searchAndRead('q', { readTopN: 5 });
    expect(r.citations).toHaveLength(1);
  });
});
