import { CaesarClient } from './caesar';
import type { Citation } from './caesar';

export interface Offer {
  productTitle: string;
  retailer: string;
  url: string;
  price?: string;
  snippet?: string;
  captureTime?: string;
  rank: number;
}

export interface FinderResult {
  query: string;
  topMatch?: string;
  offers: Offer[];
  degraded: boolean;
}

/** Friendly names for the retailers we see most; everything else is derived from the domain. */
const RETAILERS: Record<string, string> = {
  amazon: 'Amazon', bestbuy: 'Best Buy', walmart: 'Walmart', target: 'Target', ebay: 'eBay',
  newegg: 'Newegg', etsy: 'Etsy', wayfair: 'Wayfair', costco: 'Costco', homedepot: 'The Home Depot',
  lowes: "Lowe's", macys: "Macy's", nordstrom: 'Nordstrom', nike: 'Nike', adidas: 'Adidas', rei: 'REI',
  apple: 'Apple', sony: 'Sony', samsung: 'Samsung', ikea: 'IKEA', sephora: 'Sephora', chewy: 'Chewy',
};

const TLDS = new Set(['com', 'net', 'org', 'io', 'co', 'uk', 'us', 'ca', 'de', 'fr', 'shop', 'store', 'app']);

// --- price parsing -------------------------------------------------------

// Symbols + unambiguous $-anchored prefixes (US$, A$, …). Global so we see every amount.
const PRICE_RE = /(?:US\$|A\$|C\$|NZ\$|R\$|[$£€¥₹])\s?\d[\d.,]*/g;
// A currency amount is NOT the item price when the word touching it is promo/shipping/strikethrough.
const NEG_BEFORE = new Set(['save', 'saves', 'saved', 'was', 'off', 'shipping', 'over', 'reg', 'regular', 'msrp', 'coupon', 'discount', 'discounts', 'code', 'orders', 'earn', 'back']);
const NEG_AFTER = new Set(['off', 'shipping']);

function adjacentWord(s: string): string {
  return (s.match(/[A-Za-z]+/g)?.pop() ?? s.match(/[A-Za-z]+/)?.[0] ?? '').toLowerCase();
}

/** The first plausible *item* price in some captured text — skipping shipping/discount/strikethrough amounts. */
export function parsePrice(text: string): string | undefined {
  const s = text ?? '';
  for (const m of s.matchAll(PRICE_RE)) {
    const start = m.index ?? 0;
    const before = (s.slice(0, start).match(/(\S+)\s*$/)?.[1] ?? '').toLowerCase().replace(/[^a-z]/g, '');
    const after = (s.slice(start + m[0].length).match(/^\s*(\S+)/)?.[1] ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (NEG_BEFORE.has(before) || NEG_AFTER.has(after)) continue;
    return m[0].replace(/\s/g, '').replace(/[.,]+$/, '');
  }
  return undefined;
}

// --- retailer + title ----------------------------------------------------

/** The registrable label of a host ("amazon" from www.amazon.co.uk / smile.amazon.com). */
function registrableLabel(host: string): string {
  const labels = host.replace(/^www\./, '').toLowerCase().split('.').filter(Boolean);
  return [...labels].reverse().find((l) => !TLDS.has(l)) ?? labels[0] ?? host;
}

/** A friendly retailer name from a URL (known map on the registrable label, else title-cased). */
export function retailerName(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'Unknown';
  }
  const reg = registrableLabel(host);
  if (RETAILERS[reg]) return RETAILERS[reg];
  return reg.charAt(0).toUpperCase() + reg.slice(1);
}

/** Strip a trailing " <sep> <site name>" suffix from a page title (keeps product hyphens). */
export function cleanTitle(title: string): string {
  const t = (title ?? '').replace(/\s+/g, ' ').trim();
  return t
    .replace(/\s*[-|:–·]\s*(?:[A-Za-z0-9.'& ]+\.(?:com|net|org|co\.uk)|amazon|best buy|walmart|target|ebay|newegg|etsy|wayfair)\b.*$/i, '')
    .trim();
}

/** Remove a trailing " <sep> <retailer>" we already know (handles names like "Macy's" the generic strip misses). */
function stripRetailerSuffix(title: string, retailer: string): string {
  const esc = retailer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return title.replace(new RegExp(`\\s*[-|:–·]\\s*${esc}(?:\\.[a-z]{2,3})?\\s*$`, 'i'), '').trim();
}

/** The single most query-relevant sentence (a "what it is" line), cleaned for display. */
export function bestSnippet(text: string, query: string, maxLen = 160): string | undefined {
  if (!text) return undefined;
  const terms = (query.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? []).filter((w) => w.length > 2);
  const sentences = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 20 && s.length < 300);
  if (sentences.length === 0) return undefined;
  let best = '';
  let bestScore = -1;
  for (const s of sentences) {
    const lc = s.toLowerCase();
    const score = terms.filter((term) => lc.includes(term)).length;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  const chosen = bestScore > 0 ? best : sentences[0];
  return chosen.length > maxLen ? chosen.slice(0, maxLen).replace(/\s+\S*$/, '') + '…' : chosen;
}

// --- offers --------------------------------------------------------------

// A page is a buyable product if it has a price, a product-detail URL path, or cart/stock language.
const PRODUCT_PATH = /\/(dp|gp\/product|p|ip|itm|product|products|pd|sku|buy)\//i;
const BUY_TEXT = /add to (?:cart|bag|basket)|buy now|in stock|out of stock|add-to-cart/i;
// Titles that signal a review/roundup/comparison rather than a single product listing.
const ROUNDUP_TITLE = /\b(\d+\s+)?best\b|\breview(s)?\b|\bvs\.?\b|\bversus\b|\bbuying guide\b|\bguide\b|\bhow to\b|\bround[- ]?up\b|\bcompared\b/i;
// Domains that are never "where to buy" — review, news, forum, and content sites.
const NON_RETAIL = new Set([
  'consumerreports', 'wirecutter', 'nytimes', 'rtings', 'cnet', 'techradar', 'tomsguide', 'theverge',
  'reddit', 'youtube', 'wikipedia', 'pcmag', 'engadget', 'forbes', 'businessinsider', 'buzzfeed',
  'medium', 'quora', 'gizmodo', 'wired', 'digitaltrends', 'soundguys', 'whathifi', 'trustedreviews',
  'tripadvisor', 'yelp', 'pinterest', 'facebook', 'instagram', 'tiktok',
]);

/**
 * Build product offers from search+read citations. Only pages actually READ
 * (real capture provenance) AND showing a buy signal (price / product path /
 * cart language) become offers — review roundups and bare category pages are
 * dropped. One offer per retailer, in Caesar's relevance order.
 */
export function extractOffers(citations: Citation[], query: string): Offer[] {
  const seen = new Set<string>();
  const offers: Offer[] = [];
  for (const c of citations) {
    if (!c.canonicalUrl || !c.captureTime) continue; // captured (read) pages only
    let u: URL;
    try {
      u = new URL(c.canonicalUrl);
    } catch {
      continue;
    }
    const reg = registrableLabel(u.hostname);
    if (NON_RETAIL.has(reg)) continue; // review/news/forum sites are never where-to-buy
    const retailer = RETAILERS[reg] ?? (reg.charAt(0).toUpperCase() + reg.slice(1));
    if (seen.has(retailer)) continue;
    const body = c.text && c.text.length > 0 ? c.text : (c.passage ?? '');
    // A currency token is a useful *buy signal* (this is a product/listing page),
    // but on a web-search capture it's unreliably the PRODUCT's price (payment
    // plans, accessories, "frequently bought together" all surface) — so we use
    // it to gate, never to display. Showing a wrong price would break the whole
    // portfolio's "receipts, not a model's memory" premise.
    const priceSignal = parsePrice(body);
    const looksProduct = Boolean(priceSignal) || PRODUCT_PATH.test(u.pathname) || BUY_TEXT.test(body);
    const looksRoundup = ROUNDUP_TITLE.test(c.title ?? '') && !priceSignal && !PRODUCT_PATH.test(u.pathname);
    if (!looksProduct || looksRoundup) continue; // require a real buy signal
    seen.add(retailer);
    offers.push({
      productTitle: stripRetailerSuffix(cleanTitle(c.title || retailer), retailer),
      retailer,
      url: c.canonicalUrl,
      price: undefined,
      snippet: bestSnippet(body, query),
      captureTime: c.captureTime,
      rank: c.rank,
    });
  }
  return offers.sort((a, b) => a.rank - b.rank);
}

// Words that are never part of a product name (used when mining a name from article titles).
const STOP_TITLE = new Set([
  'best', 'the', 'review', 'reviews', 'reviewed', 'vs', 'versus', 'guide', 'guides', 'how', 'top',
  'of', 'for', 'and', 'a', 'an', 'your', 'our', 'why', 'are', 'is', 'to', 'in', 'on', 'with', 'what',
  'which', 'should', 'you', 'buy', 'price', 'prices', 'deals', 'deal', 'sale', 'new', 'this', 'that',
  'my', 'it', 'its', 'worth', 'original', 'tested', 'best-selling', 'i', 'we',
]);

/**
 * Mine the most likely product NAME from read article/result titles (for the
 * "describe it" case where Caesar returns reviews, not buy pages). Counts
 * capitalized brand+model bigrams across titles so varying suffixes ("Vibram
 * FiveFingers KSO" vs "Vibram FiveFingers") still agree, then returns the
 * shortest title phrase carrying the winning bigram.
 */
export function identifyProduct(citations: Citation[], _query: string): string | undefined {
  const bigrams = new Map<string, number>();
  const phrases: string[] = [];
  for (const c of citations) {
    if (!c.captureTime) continue;
    const title = cleanTitle(c.title ?? '');
    const caps = title.match(/\b[A-Z][A-Za-z0-9]+(?:[-\s][A-Z0-9][A-Za-z0-9-]*){0,3}\b/g) ?? [];
    for (const p of caps) {
      const toks = p.split(/\s+/).filter((t) => !STOP_TITLE.has(t.toLowerCase()));
      if (toks.length) phrases.push(toks.join(' '));
      for (let i = 0; i + 1 < toks.length; i++) {
        const bg = `${toks[i]} ${toks[i + 1]}`.toLowerCase();
        if (bg.replace(/[^a-z0-9]/g, '').length < 6) continue;
        bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
      }
    }
  }
  let top: string | undefined;
  let topN = 0;
  for (const [bg, n] of bigrams) {
    if (n > topN) { topN = n; top = bg; }
  }
  if (!top || topN < 2) return undefined;
  const matching = phrases.filter((p) => p.toLowerCase().startsWith(top!)).sort((a, b) => a.length - b.length);
  return matching[0] ?? top.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Best guess at "what is this product" — the top offer's title, but only when
 * the results cohere around ONE product (so a vague query that returns three
 * different products doesn't claim they're all the top one).
 */
export function topMatch(offers: Offer[]): string | undefined {
  if (!offers.length) return undefined;
  const top = offers[0].productTitle;
  if (offers.length === 1) return top;
  const tokens = top.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  // Prefer a model-number token (contains a digit, e.g. "wh-1000xm5") as the
  // identity — generic descriptors ("cancellation") vary across retailers and
  // would wrongly break coherence for the same product.
  const withDigit = tokens.filter((t) => /\d/.test(t));
  const identity = (withDigit.length ? withDigit : tokens).sort((a, b) => b.length - a.length)[0];
  if (!identity) return top;
  const agree = offers.filter((o) => o.productTitle.toLowerCase().includes(identity)).length;
  return agree / offers.length >= 0.5 ? top : undefined;
}

/**
 * Search the live web for a product (by name OR description), read the top
 * results, and return where-to-buy offers. Keyless by default. Only THROWS (and
 * VERIFIER_DEMO) fall back to the baked demo; a search that simply found no
 * buyable product returns an honest empty result (degraded:false).
 */
export async function runFinder(
  input: string,
  deps: { client?: CaesarClient } = {},
): Promise<FinderResult> {
  const query = input.trim();
  if (process.env.VERIFIER_DEMO) return demoFinder(query);
  const client = deps.client ?? new CaesarClient();
  try {
    const first = await client.searchAndRead(query, { maxResults: 10, readTopN: 6 });
    const offers1 = extractOffers(first.citations, query);
    // Named product: the query already surfaced retailers — done in one search.
    if (offers1.length >= 2) {
      return { query, topMatch: topMatch(offers1), offers: offers1, degraded: false };
    }
    // Description (or thin result): identify the product, then search retailers for it.
    const product = topMatch(offers1) ?? identifyProduct(first.citations, query);
    if (product) {
      const second = await client.searchAndRead(product, { maxResults: 10, readTopN: 6 });
      const offers2 = extractOffers(second.citations, product);
      if (offers2.length > 0) return { query, topMatch: product, offers: offers2, degraded: false };
      return { query, topMatch: product, offers: offers1, degraded: false };
    }
    return { query, topMatch: topMatch(offers1), offers: offers1, degraded: false };
  } catch {
    return demoFinder(query);
  }
}

/** Shown when the free tier is busy (and in VERIFIER_DEMO mode). */
function demoFinder(query: string): FinderResult {
  return {
    query: query || 'noise-cancelling headphones for long flights',
    topMatch: 'Sony WH-1000XM5 Wireless Headphones',
    degraded: true,
    offers: [
      { productTitle: 'Sony WH-1000XM5 Wireless Noise-Cancelling Headphones', retailer: 'Amazon', url: 'https://www.amazon.com/dp/B09XS7JWHH', price: '$398.00', snippet: 'Industry-leading noise cancellation with two processors controlling eight microphones.', captureTime: '2026-06-22T09:41:00Z', rank: 1 },
      { productTitle: 'Sony WH-1000XM5 Headphones', retailer: 'Best Buy', url: 'https://www.bestbuy.com/site/sony-wh1000xm5', price: '$349.99', snippet: 'Crystal clear hands-free calling with precise voice pickup technology.', captureTime: '2026-06-22T09:38:00Z', rank: 2 },
      { productTitle: 'Sony WH-1000XM5', retailer: 'Target', url: 'https://www.target.com/p/sony-wh-1000xm5', price: '$379.99', snippet: 'Up to 30-hour battery life with quick charging (3 min charge for 3 hours).', captureTime: '2026-06-22T09:30:00Z', rank: 3 },
    ],
  };
}
