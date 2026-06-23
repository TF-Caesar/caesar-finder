import { FinderPanel } from '../components/FinderPanel';

/** The real Caesar mark (rounded charcoal chip + ivory twin-spiral) from public/favicon.svg. */
function CaesarMark() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/favicon.svg" alt="" aria-hidden="true" width={28} height={28} className="block" />;
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-frame px-6">
      <header className="mx-auto flex max-w-measure items-center gap-2.5 pt-10 sm:pt-14">
        <CaesarMark />
        <span className="font-display text-[17px] text-ink-mark">Caesar Finder</span>
      </header>

      <section className="mx-auto max-w-measure pt-16 sm:pt-24">
        <span className="inline-flex items-center gap-2 rounded-pill bg-clay-tint px-3 py-1 text-[12px] font-medium text-clay-deep">
          <span className="h-1.5 w-1.5 rounded-full bg-clay" aria-hidden="true" />
          Real listings, captured with a timestamp
        </span>

        <h1 className="mt-5 text-[clamp(2.4rem,5vw,3.25rem)] leading-[1.05] tracking-tightest">
          Find the product, and where to buy it.
        </h1>

        <p className="mt-4 max-w-[44ch] text-[1.0625rem] leading-relaxed text-ink-2">
          Name it, or just describe the one you&rsquo;re picturing. Caesar reads the live
          listings and shows what it is and where it&rsquo;s sold — with the captured price and
          the moment it was captured. Free, no signup — powered by{' '}
          <a
            href="https://trycaesar.com"
            target="_blank"
            rel="noreferrer"
            className="text-ink underline decoration-hairline underline-offset-4 transition-colors duration-editorial ease-editorial hover:decoration-ink"
          >
            Caesar
          </a>{' '}
          search.
        </p>
      </section>

      <section className="mx-auto mt-10 max-w-measure">
        <FinderPanel />
      </section>

      <footer className="mx-auto mt-24 max-w-measure pb-16 pt-10">
        <p className="text-[12px] text-ink-2">
          Powered by{' '}
          <a
            href="https://trycaesar.com"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-hairline underline-offset-4 transition-colors duration-editorial ease-editorial hover:text-ink hover:decoration-ink"
          >
            Caesar search
          </a>{' '}
          — free, no signup. Prices are a point-in-time capture, not a live quote.
        </p>
      </footer>
    </main>
  );
}
