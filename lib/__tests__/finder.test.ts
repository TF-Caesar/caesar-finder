import { describe, it, expect, vi } from 'vitest';
import { parsePrice, retailerName, cleanTitle, extractOffers, topMatch, identifyProduct, runFinder } from '../finder';
import type { Offer } from '../finder';
import { CaesarClient } from '../caesar';
import type { Citation } from '../caesar';

describe('parsePrice', () => {
  it('pulls a real price and trims trailing punctuation', () => {
    expect(parsePrice('On sale for $348.00 today')).toBe('$348.00');
    expect(parsePrice('Price: £1,299 incl VAT')).toBe('£1,299');
    expect(parsePrice('Now €89,99.')).toBe('€89,99');
    expect(parsePrice('Just $5. Buy now')).toBe('$5');
  });
  it('skips promo / shipping / strikethrough amounts and picks the item price', () => {
    expect(parsePrice('Free shipping on orders over $35. Price now $249.99')).toBe('$249.99');
    expect(parsePrice('Save $20! Was $120 now $100')).toBe('$100');
  });
  it('returns undefined when the only amounts are promos or there is no price', () => {
    expect(parsePrice('$30 off select items')).toBeUndefined();
    expect(parsePrice('free shipping over $50 — members only')).toBeUndefined();
    expect(parsePrice('no price mentioned here at all')).toBeUndefined();
    expect(parsePrice('')).toBeUndefined();
  });
  it('recognizes more currencies', () => {
    expect(parsePrice('Costs ¥4980 today')).toBe('¥4980');
    expect(parsePrice('Only ₹1,499 right now')).toBe('₹1,499');
    expect(parsePrice('US$49.99 right now')).toBe('US$49.99');
  });
});

describe('retailerName', () => {
  it('maps known retailer domains to friendly names', () => {
    expect(retailerName('https://www.amazon.com/dp/B0123')).toBe('Amazon');
    expect(retailerName('https://www.bestbuy.com/site/x')).toBe('Best Buy');
    expect(retailerName('https://ebay.com/itm/1')).toBe('eBay');
  });
  it('uses the registrable label, so a brand word in a subdomain is not misattributed', () => {
    expect(retailerName('https://newegg.com/p/x')).toBe('Newegg');
    expect(retailerName('https://store.sony.co.uk/x')).toBe('Sony');
    expect(retailerName('https://apple.fanblog.com/post')).toBe('Fanblog'); // NOT "Apple"
    expect(retailerName('https://smile.amazon.com/dp/x')).toBe('Amazon');
  });
});

describe('cleanTitle', () => {
  it('strips a trailing site-name suffix without harming product hyphens', () => {
    expect(cleanTitle('Sony WH-1000XM5 Headphones - Amazon.com')).toBe('Sony WH-1000XM5 Headphones');
    expect(cleanTitle('Vibram FiveFingers KSO | Best Buy')).toBe('Vibram FiveFingers KSO');
  });
});

const productCites: Citation[] = [
  {
    rank: 1, title: 'Sony WH-1000XM5 Wireless Headphones - Amazon.com', canonicalUrl: 'https://www.amazon.com/dp/x', docId: 'd1',
    captureTime: '2026-06-22T10:00:00Z',
    text: 'The Sony WH-1000XM5 are wireless noise-cancelling headphones with 30-hour battery. In stock for $398.00.',
  },
  { rank: 2, title: 'Search only result', canonicalUrl: 'https://www.example.com/x', docId: 'd2' }, // unread: no captureTime
  {
    rank: 3, title: 'WH-1000XM5 | Best Buy', canonicalUrl: 'https://www.bestbuy.com/site/x', docId: 'd3',
    captureTime: '2026-06-22T11:00:00Z', text: 'Sony noise cancelling headphones, now $349.99 at Best Buy.',
  },
];

describe('extractOffers', () => {
  it('builds offers only from READ pages with a buy signal; price is never surfaced from a capture', () => {
    const offers = extractOffers(productCites, 'sony wh-1000xm5');
    expect(offers).toHaveLength(2); // unread d2 dropped
    expect(offers[0]).toMatchObject({ retailer: 'Amazon' });
    expect(offers[1]).toMatchObject({ retailer: 'Best Buy' });
    // a currency token gates the page in but is too unreliable to display as the price
    expect(offers.every((o) => o.price === undefined)).toBe(true);
  });
  it('drops review roundups / pages with no buy signal', () => {
    const mixed: Citation[] = [
      productCites[0],
      {
        rank: 2, title: 'The 7 Best Noise Cancelling Headphones (2026 Reviews)',
        canonicalUrl: 'https://www.nytimes.com/wirecutter/reviews/best-headphones/', docId: 'r1',
        captureTime: '2026-06-22T10:00:00Z', text: 'We tested thirty pairs of headphones over six months to find the best.',
      },
    ];
    const offers = extractOffers(mixed, 'best noise cancelling headphones');
    expect(offers).toHaveLength(1);
    expect(offers[0].retailer).toBe('Amazon');
  });
  it('drops review/news/forum sites that are never where-to-buy', () => {
    const cites: Citation[] = [
      productCites[0], // Amazon — kept
      { rank: 2, title: 'The Dyson V15 Detect Impresses in Consumer Reports', canonicalUrl: 'https://www.consumerreports.org/vacuums/dyson-v15', docId: 'cr', captureTime: 't', text: 'We tested it; it sells for about $749 at retailers.' },
      { rank: 3, title: 'Best vacuum? — r/vacuums', canonicalUrl: 'https://www.reddit.com/r/vacuums/comments/x', docId: 'rd', captureTime: 't', text: 'I paid $600 for mine' },
    ];
    const offers = extractOffers(cites, 'dyson v15');
    expect(offers).toHaveLength(1);
    expect(offers[0].retailer).toBe('Amazon');
  });
  it('strips the retailer name from the product title', () => {
    const cites: Citation[] = [
      { rank: 1, title: "Dyson V15 Detect Absolute Cordless Vacuum - Macy's", canonicalUrl: 'https://www.macys.com/shop/product/dyson-v15', docId: 'm', captureTime: 't', text: 'Add to bag. In stock.' },
    ];
    expect(extractOffers(cites, 'dyson v15')[0].productTitle).toBe('Dyson V15 Detect Absolute Cordless Vacuum');
  });
  it('dedups by retailer identity, including subdomains', () => {
    const dup: Citation[] = [
      ...productCites,
      { rank: 4, title: 'Sony - Amazon', canonicalUrl: 'https://smile.amazon.com/dp/y', docId: 'd4', captureTime: '2026-06-22T12:00:00Z', text: 'in stock, now $401.00' },
    ];
    expect(extractOffers(dup, 'sony').filter((o) => o.retailer === 'Amazon')).toHaveLength(1);
  });
});

describe('topMatch', () => {
  it('returns the top product title when the offers cohere around one product', () => {
    expect(topMatch(extractOffers(productCites, 'sony'))).toBe('Sony WH-1000XM5 Wireless Headphones');
  });
  it('coheres on the model number even when descriptors vary (canceling vs cancellation)', () => {
    const offers: Offer[] = [
      { productTitle: 'Sony WH-1000XM5 Wireless Headphones with Active Noise Cancellation', retailer: 'Headphones', url: 'https://headphones.com/a', rank: 1, captureTime: 't' },
      { productTitle: 'Sony WH-1000XM5 Wireless Industry Leading Noise Canceling Headphones', retailer: 'Amazon', url: 'https://amazon.com/b', rank: 2, captureTime: 't' },
      { productTitle: 'Sony Black Over-Ear WH-1000XM5 Wireless Noise Canceling', retailer: 'Abt', url: 'https://abt.com/c', rank: 3, captureTime: 't' },
    ];
    expect(topMatch(offers)).toContain('WH-1000XM5');
  });
  it('is undefined when the offers are clearly different products', () => {
    const diverse: Offer[] = [
      { productTitle: 'Sony WF-1000XM4 Earbuds', retailer: 'Amazon', url: 'https://amazon.com/a', rank: 1, captureTime: 't' },
      { productTitle: 'Apple AirPods Pro', retailer: 'Best Buy', url: 'https://bestbuy.com/b', rank: 2, captureTime: 't' },
      { productTitle: 'Bose QuietComfort Ultra', retailer: 'Target', url: 'https://target.com/c', rank: 3, captureTime: 't' },
    ];
    expect(topMatch(diverse)).toBeUndefined();
  });
  it('is undefined when there are no offers', () => {
    expect(topMatch([])).toBeUndefined();
  });
});

const articleCites: Citation[] = [
  { rank: 1, title: 'Vibram FiveFingers KSO: The Original Toe Shoe, Reviewed', canonicalUrl: 'https://www.outdoorgearlab.com/reviews/vibram', docId: 'a1', captureTime: 't', text: 'The Vibram FiveFingers KSO is the classic toe shoe with individual toe pockets.' },
  { rank: 2, title: 'Are Vibram FiveFingers Worth It? A Runner Weighs In', canonicalUrl: 'https://www.runnersworld.com/gear/vibram', docId: 'a2', captureTime: 't', text: 'Vibram FiveFingers have separate slots for each toe.' },
  { rank: 3, title: 'The 8 Best Barefoot Running Shoes of 2026', canonicalUrl: 'https://www.runnersworld.com/best-barefoot', docId: 'a3', captureTime: 't', text: 'A roundup of barefoot shoes.' },
];

describe('identifyProduct', () => {
  it('extracts the repeated brand+model from article titles', () => {
    expect(identifyProduct(articleCites, 'running shoes with individual toe slots')).toContain('Vibram FiveFingers');
  });
  it('is undefined when no product name repeats', () => {
    expect(identifyProduct([{ rank: 1, title: 'asdf gibberish nonsense', canonicalUrl: 'https://en.wikipedia.org/x', docId: 'd', captureTime: 't', text: 'no product' }], 'asdfgh')).toBeUndefined();
  });
});

describe('runFinder', () => {
  function fakeClient(over: Partial<CaesarClient>): CaesarClient {
    return Object.assign(Object.create(CaesarClient.prototype), over) as CaesarClient;
  }
  it('returns offers from Caesar (not degraded) with a top match, in ONE search for a named product', async () => {
    const searchAndRead = vi.fn().mockResolvedValue({ evidence: 'x', citations: productCites });
    const out = await runFinder('sony wh-1000xm5', { client: fakeClient({ searchAndRead }) });
    expect(out.degraded).toBe(false);
    expect(out.offers[0].retailer).toBe('Amazon');
    expect(out.topMatch).toContain('Sony');
    expect(searchAndRead).toHaveBeenCalledTimes(1); // named product: no second search needed
  });

  it('two-stage: identifies the product from a description, then searches retailers for it', async () => {
    const retailerCites: Citation[] = [
      { rank: 1, title: 'Vibram FiveFingers KSO - Amazon.com', canonicalUrl: 'https://www.amazon.com/dp/v', docId: 'r1', captureTime: 't', text: 'Add to cart. In stock.' },
      { rank: 2, title: 'Vibram FiveFingers | REI Co-op', canonicalUrl: 'https://www.rei.com/product/vibram', docId: 'r2', captureTime: 't', text: 'In stock, add to cart.' },
    ];
    const searchAndRead = vi.fn()
      .mockResolvedValueOnce({ evidence: 'x', citations: articleCites })   // stage 1: articles, no buy pages
      .mockResolvedValueOnce({ evidence: 'x', citations: retailerCites }); // stage 2: retailers
    const out = await runFinder('running shoes with individual toe slots', { client: fakeClient({ searchAndRead }) });
    expect(searchAndRead).toHaveBeenCalledTimes(2);
    expect(out.topMatch).toContain('Vibram FiveFingers');
    expect(out.offers.map((o) => o.retailer)).toEqual(['Amazon', 'REI']);
    expect(out.degraded).toBe(false);
  });
  it('degrades to a demo result only when Caesar THROWS', async () => {
    const client = fakeClient({ searchAndRead: vi.fn().mockRejectedValue(new Error('429')) });
    const out = await runFinder('headphones', { client });
    expect(out.degraded).toBe(true);
    expect(out.offers.length).toBeGreaterThan(0);
  });
  it('returns an honest empty result (not the demo) when the search ran but nothing was a buyable product', async () => {
    const client = fakeClient({ searchAndRead: vi.fn().mockResolvedValue({ evidence: '', citations: [
      { rank: 1, title: 'asdf gibberish', canonicalUrl: 'https://en.wikipedia.org/wiki/Nonsense', docId: 'd1', captureTime: 't', text: 'This is an encyclopedia article, not a product.' },
    ] }) });
    const out = await runFinder('asdfghjkl', { client });
    expect(out.degraded).toBe(false);
    expect(out.offers).toHaveLength(0);
    expect(out.topMatch).toBeUndefined();
  });
});
