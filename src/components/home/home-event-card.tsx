import Link from "next/link";
import { formatEventDates } from "@/lib/platform/event-label";
import { copy } from "@/lib/ui-copy";
import type { LandingEvent } from "@/components/landing-event-card";

/** One public event on the home page: a mark (the organisation's initial), the name, the dates and one line of status. The whole card opens the event page. */
export function HomeEventCard({ event, now, featured, finished }: { event: LandingEvent; now?: string | null; featured?: boolean; finished?: boolean }) {
  const live = event.status === "live";
  const initial = (event.organisation_name ?? event.name).trim().charAt(0).toUpperCase() || "•";
  const dates = formatEventDates(event.start_date, event.end_date);
  const where = [event.organisation_name, event.location].map((p) => (p ?? "").trim()).filter(Boolean).join(" · ");
  return (
    <Link href={`/e/${event.slug}`} className={`home-card${featured ? " featured" : ""}`} data-testid="landing-event" data-status={event.status} data-featured={featured || undefined}>
      <span className="home-mark" aria-hidden>
        {initial}
      </span>
      <span className="home-body">
        {live ? (
          <span className="home-live" data-testid="live-dot">
            <span aria-hidden className="home-dot" />
            {copy.landing.liveWord}
          </span>
        ) : null}
        <span className="home-name">{event.name}</span>
        {dates ? <span className="home-meta">{dates}</span> : null}
        {live ? (
          <span className="home-status" data-testid="live-now">
            {now ? copy.landing.nowLine(now) : copy.landing.liveNoHeat}
          </span>
        ) : where ? (
          <span className="home-status">{where}</span>
        ) : null}
        {finished ? <span className="home-tag">{copy.landing.resultsTag}</span> : null}
      </span>
    </Link>
  );
}
