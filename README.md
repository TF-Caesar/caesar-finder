# Caesar Finder

Name a product, or **describe the one you're picturing**. Caesar searches the live web, reads the listings, and shows you **what it is and where to buy it** — each with **the moment that page was captured**, not a model's memory.

Free. No signup. No API key. Powered by [Caesar](https://trycaesar.com) search.

## Why this is different

Most "find me this product" tools either guess from a model's training data (stale, no link) or are locked to one store's catalog. This one **reads live retailer and product pages** and shows you the receipt: the product, the retailer, a click-through, and a capture timestamp. Two jobs, one box:

- **Name it** (`Sony WH-1000XM5`) → a tidy list of where it's sold, each captured with a timestamp.
- **Describe it** (`running shoes with individual toe slots`) → Caesar surfaces the matching product, leads with its best guess (**Looks like →**), then shows where to buy.

## Run it locally (zero setup)

```bash
git clone https://github.com/TF-Caesar/caesar-finder
cd caesar-finder
npm install
npm run dev
```

No keys required — it runs on Caesar's free anonymous tier. Optional env:

- `CAESAR_SEARCH_API_KEY` — higher rate limits.
- `VERIFIER_DEMO=1` — force the cached demo response (offline showcase).

## How it works

`search` the query → `read` the top results → for each **captured** page, derive the retailer (from the domain) and extract a one-line "what it is" — then list one offer per retailer in relevance order. The entire Caesar integration is one small, dependency-light file you can copy into your own project: [`lib/caesar.ts`](lib/caesar.ts).

**Honest by design:** Caesar is a general web search/read API, not a shopping API. Only pages actually read become offers (no search-only phantoms), and we deliberately **don't show prices** — major retailers render them in JavaScript, so a web-search capture mostly catches accessory or payment-plan amounts, and a wrong price is worse than none. Click through to the retailer for the live price.

## License

MIT.
