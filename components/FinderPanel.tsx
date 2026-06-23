'use client';

import { useState } from 'react';
import type { FinderResult } from '../lib/finder';
import { ProductCard } from './ProductCard';

const EXAMPLES = [
  'Sony WH-1000XM5',
  'running shoes with individual toe slots',
  'the gadget that tells you when fruit is ripe',
];

export function FinderPanel() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FinderResult | null>(null);

  async function run(text: string) {
    if (!text.trim()) return;
    setLoading(true);
    setData(null);
    try {
      const res = await fetch('/api/find', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: text }),
      });
      setData((await res.json()) as FinderResult);
    } finally {
      setLoading(false);
    }
  }

  const offers = data?.offers ?? [];

  return (
    <div>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run(query); }}
          placeholder="Name a product, or describe the one you're picturing…"
          aria-label="Product name or description"
          className="w-full rounded-input border border-hairline bg-paper px-4 py-3 text-[15px] leading-relaxed text-ink outline-none transition-colors duration-editorial ease-editorial placeholder:text-ink-2 focus:border-ink-2"
        />
        <button
          onClick={() => run(query)}
          disabled={loading || !query.trim()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-pill bg-ink px-5 py-2.5 text-[13px] font-medium text-paper transition-colors duration-editorial ease-editorial hover:bg-ink-mark disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay" aria-hidden="true" />}
          {loading ? 'Finding…' : 'Find it'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => { setQuery(ex); run(ex); }}
            disabled={loading}
            className="rounded-pill border border-hairline bg-surface px-3.5 py-2 text-[13px] text-ink-2 transition-colors duration-editorial ease-editorial hover:border-clay hover:text-clay-deep disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>

      {data?.degraded && (
        <div className="mt-7 inline-flex items-center gap-2 rounded-pill bg-surface px-3 py-1.5 text-[12px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-clay" aria-hidden="true" />
          Showing a cached example — the free tier is busy right now.
        </div>
      )}

      {data?.topMatch && offers.length > 0 && (
        <div className="mt-7">
          <span className="font-mono text-[11px] uppercase tracking-label text-ink-2">Looks like →</span>
          <p className="mt-1 text-[1.4rem] leading-tight tracking-tightest text-ink-mark">{data.topMatch}</p>
        </div>
      )}

      {offers.length > 0 && (
        <div className="mt-5 space-y-3">
          {offers.map((o, i) => (
            <div key={o.url} className="cv-rise" style={{ animationDelay: `${i * 60}ms` }}>
              <ProductCard offer={o} />
            </div>
          ))}
          <p className="pt-2 text-[12px] text-ink-2">
            Prices are what each page showed the moment Caesar captured it — click through for the current price.
          </p>
        </div>
      )}

      {data && offers.length === 0 && !data.degraded && (
        <p className="mt-7 text-[13px] text-ink-2">
          No live listings found for that. Try a brand and model, or describe a distinctive feature.
        </p>
      )}
    </div>
  );
}
