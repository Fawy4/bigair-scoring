import Link from "next/link";
import type { LadderRoundVM, LadderHeatVM } from "@/lib/public/ladder-model";
import { copy } from "@/lib/ui-copy";

const L = copy.pub.ladder;
const STATE = { complete: L.complete, live: L.live, scheduled: L.scheduled };

function HeatCard({ heat, href }: { heat: LadderHeatVM; href: string | null }) {
  return (
    <article data-testid="ladder-heat" data-state={heat.state} className="flex min-w-[15rem] flex-1 flex-col overflow-hidden rounded-card border border-beach-line bg-beach-surface">
      <header className="flex items-center justify-between gap-2 px-2 py-1">
        <span className="text-body font-semibold">{href ? <Link prefetch={false} href={href} className="underline">{heat.name}</Link> : heat.name}</span>
        <span className="rounded-full border border-beach-line px-1.5 text-small font-semibold">{STATE[heat.state]}</span>
      </header>
      {heat.riders.map((r, i) => (
        <div
          key={i}
          data-testid="ladder-rider"
          data-placeholder={r.placeholder}
          data-pending={r.pending}
          className="flex min-h-row items-center justify-between gap-2 px-2 text-body font-semibold"
          style={r.hex ? { backgroundColor: r.hex, color: r.ink } : { backgroundColor: "var(--beach-tint-grey)", color: "var(--beach-ink)" }}
        >
          <span className="min-w-0 truncate">
            {r.colourWord ? <span className="mr-1 text-small font-semibold uppercase tracking-wide">{r.colourWord}</span> : null}
            {r.name}
            {r.walkover ? " · DNS" : ""}
          </span>
          <span className="shrink-0 tabular-nums">{r.totalLabel}</span>
        </div>
      ))}
    </article>
  );
}

/** The ladder: rounds as labelled groups, every heat a card, riders filled with their Lycra colour (the colour word beside the name) and their total. */
export function LadderView({ rounds, heatHref }: { rounds: LadderRoundVM[]; heatHref: (heatId: string) => string }) {
  return (
    <div data-testid="ladder" className="flex flex-col gap-2">
      {rounds.map((round) => (
        <section key={round.id} aria-label={round.name} className="flex flex-col gap-1">
          <h3 className="self-start rounded-full border border-beach-line bg-beach-surface px-2 text-small font-semibold">{round.name}</h3>
          <div className="flex flex-wrap gap-1.5">
            {round.heats.map((h) => (
              <HeatCard key={h.id} heat={h} href={h.state === "complete" && h.heatId ? heatHref(h.heatId) : null} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
