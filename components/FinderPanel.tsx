'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { FinderEvent, FinderResult, Offer } from '../lib/finder';
import { parseNdjson } from '../lib/ndjson';
import { ProductCard } from './ProductCard';

const EXAMPLES = [
  'Sony WH-1000XM5',
  'running shoes with individual toe slots',
  'the gadget that tells you when fruit is ripe',
];

function messageForStatus(status: number): string {
  if (status === 429) return 'This demo allows a few searches per minute. Wait a moment, then try again.';
  if (status === 413) return 'That query is too large. Try a short product name or description.';
  if (status === 400) return "That didn't look like a searchable query. Try a product name or a short description.";
  return 'Something went wrong on our end. Try again in a moment.';
}

/** One dim line narrating what the finder is doing right now. */
function stageLine(e: Extract<FinderEvent, { type: 'status' }>): string {
  if (e.stage === 'searching') return 'searching the live web…';
  if (e.stage === 'reading') return e.count === 1 ? 'reading 1 page…' : `reading ${e.count} pages…`;
  if (e.stage === 'identifying') return 'working out which product that is…';
  return `looks like: ${e.product}, finding retailers…`;
}

export function FinderPanel() {
  // useSearchParams needs a Suspense boundary in Next 15, and this panel sits
  // directly in a server page, so the boundary lives here.
  return (
    <Suspense fallback={null}>
      <FinderPanelInner />
    </Suspense>
  );
}

function FinderPanelInner() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [partial, setPartial] = useState<Offer[] | null>(null);
  const [data, setData] = useState<FinderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Monotonic request id: a response only lands if it belongs to the latest run,
  // so a slow stale response can never overwrite a newer one.
  const seqRef = useRef(0);
  const autoRanRef = useRef(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchParams = useSearchParams();

  // Deep link: a shared ?q= URL prefills the input and runs the search once.
  // The ref guard means re-renders (and StrictMode's double effect) never re-run it.
  useEffect(() => {
    const q = searchParams.get('q')?.trim();
    if (!q || autoRanRef.current) return;
    autoRanRef.current = true;
    setQuery(q);
    run(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  async function run(text: string) {
    if (!text.trim() || loading) return;
    const seq = ++seqRef.current;
    setLoading(true);
    setData(null);
    setError(null);
    setStage(null);
    setPartial(null);
    try {
      const res = await fetch('/api/find/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: text }),
        // One overall budget for the whole stream: the describe-it path runs
        // two sequential searches, each of which can take most of its 90s.
        signal: AbortSignal.timeout(150_000),
      });
      if (seq !== seqRef.current) return;
      if (!res.ok || !res.body) {
        setError(messageForStatus(res.status));
        return;
      }
      let final: FinderResult | null = null;
      for await (const line of parseNdjson(res.body)) {
        if (seq !== seqRef.current) return;
        const e = line as FinderEvent | { type: 'error' };
        if (e.type === 'status') {
          setStage(stageLine(e));
        } else if (e.type === 'offers') {
          setPartial(e.offers);
        } else if (e.type === 'done') {
          final = e.result;
        } else if (e.type === 'error') {
          break;
        }
      }
      if (seq !== seqRef.current) return;
      if (!final) {
        // The stream ended without a result (mid-stream error or a dropped connection).
        setPartial(null);
        setError(messageForStatus(500));
        return;
      }
      setPartial(null);
      setData(final);
      // The URL now reproduces this search, so the share button has something real to copy.
      const url = new URL(window.location.href);
      url.searchParams.set('q', text);
      window.history.replaceState(null, '', url);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setPartial(null);
      if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        setError('This one is taking too long, so we stopped waiting. Try again: searches usually finish much faster.');
      } else {
        setError("Couldn't reach the finder. Check your connection and try again.");
      }
    } finally {
      if (seq === seqRef.current) {
        setLoading(false);
        setStage(null);
      }
    }
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      return; // clipboard blocked: leave the label alone rather than claim a copy
    }
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
  }

  const offers = data?.offers ?? [];

  return (
    <div>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !loading) run(query); }}
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
        {data && (
          <button
            onClick={share}
            className="inline-flex shrink-0 items-center justify-center rounded-pill border border-hairline bg-surface px-4 py-2.5 text-[13px] text-ink-2 transition-colors duration-editorial ease-editorial hover:border-clay hover:text-clay-deep"
          >
            {copied ? 'copied' : 'share'}
          </button>
        )}
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

      {loading && stage && (
        <p aria-live="polite" className="mt-7 flex items-center gap-2 font-mono text-[11px] text-ink-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay" aria-hidden="true" />
          {stage}
        </p>
      )}

      {loading && partial && partial.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="font-mono text-[11px] uppercase tracking-label text-ink-2">First finds · confirming</p>
          {partial.map((o) => (
            <ProductCard key={o.url} offer={o} />
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="mt-7 inline-flex items-center gap-2 rounded-pill bg-coral-tint px-3 py-1.5 text-[12px] text-coral-deep">
          <span className="h-1.5 w-1.5 rounded-full bg-coral" aria-hidden="true" />
          {error}
        </div>
      )}

      {data?.degraded && (
        <div className="mt-7 inline-flex items-center gap-2 rounded-pill bg-surface px-3 py-1.5 text-[12px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-clay" aria-hidden="true" />
          Live search is unavailable right now, showing a cached example.
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
            Each result is a live listing Caesar read and captured — click through for price and availability.
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
