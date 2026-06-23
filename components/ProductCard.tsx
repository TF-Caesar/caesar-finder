import type { Offer } from '../lib/finder';
import { safeExternalUrl } from '../lib/url';

function formatCapture(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `captured ${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function ProductCard({ offer }: { offer: Offer }) {
  const captured = formatCapture(offer.captureTime);
  const safeUrl = safeExternalUrl(offer.url);

  return (
    <article className="rounded-card border border-bone border-l-2 border-l-clay bg-paper p-5 transition-colors duration-editorial ease-editorial hover:bg-surface">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {safeUrl ? (
            <a
              href={safeUrl}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-1 text-[15px] leading-snug text-ink underline decoration-hairline underline-offset-4 transition-colors duration-editorial ease-editorial hover:decoration-ink"
            >
              {offer.productTitle}
              <span aria-hidden="true" className="text-ink-2 transition-colors duration-editorial ease-editorial group-hover:text-ink">↗</span>
            </a>
          ) : (
            <span className="text-[15px] leading-snug text-ink">{offer.productTitle}</span>
          )}
          <div className="mt-1 text-[12px] text-ink-2">{offer.retailer}</div>
        </div>
        {offer.price && (
          <span className="shrink-0 rounded-pill bg-clay-tint px-2.5 py-1 font-mono text-[13px] font-medium text-clay-deep">
            {offer.price}
          </span>
        )}
      </div>

      {offer.snippet && <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{offer.snippet}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-2">
        <span className="font-mono">{offer.price ? 'captured price' : 'price not shown on page'}</span>
        {captured && (
          <>
            <span aria-hidden="true" className="text-hairline">·</span>
            <span className="font-mono">{captured}</span>
          </>
        )}
      </div>
    </article>
  );
}
