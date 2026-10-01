import type { Sponsor } from "@/lib/public/types";
import { copy } from "@/lib/ui-copy";
import { Logo } from "./logo";

/** The sponsor logos in a row; a sponsor without a picture shows its name. A link opens in a new tab. */
export function SponsorStrip({ sponsors }: { sponsors: Sponsor[] }) {
  if (!sponsors.length) return null;
  return (
    <section data-testid="sponsor-strip" aria-label={copy.pub.home.sponsors} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 border-t border-beach-line pt-3">
      {sponsors.map((s, i) => {
        const inner = s.logoUrl ? <Logo src={s.logoUrl} alt={s.name} height={36} maxWidth={120} /> : <span className="text-body font-semibold text-beach-muted">{s.name}</span>;
        return s.url ? (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer sponsored" aria-label={s.name}>
            {inner}
          </a>
        ) : (
          <span key={i}>{inner}</span>
        );
      })}
    </section>
  );
}
