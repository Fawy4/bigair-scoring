import Link from "next/link";
import { eventLabel } from "@/lib/platform/event-label";
import { copy } from "@/lib/ui-copy";

export interface LandingEvent {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  organisation_name: string | null;
}

/** One event on the landing page: name, "Organisation · Location · Date", and for a live event a dot, the word Live and what is on now. One tap opens the event page. */
export function LandingEventCard({ event, now }: { event: LandingEvent; now?: string | null }) {
  const live = event.status === "live";
  return (
    <Link href={`/e/${event.slug}`} className="block rounded-card border border-beach-line bg-beach-bg p-3 hover:bg-beach-surface" data-testid="landing-event" data-status={event.status}>
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[16px] font-semibold">{event.name}</span>
        {live ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-small font-semibold text-beach-live" data-testid="live-dot">
            <span aria-hidden className="size-2 rounded-full bg-beach-live" />
            {copy.landing.liveWord}
          </span>
        ) : null}
      </span>
      <span className="block text-body font-medium text-beach-muted">{eventLabel({ organisation: event.organisation_name, location: event.location, startDate: event.start_date, endDate: event.end_date })}</span>
      {live && now ? (
        <span className="mt-1 block text-body font-semibold" data-testid="live-now">
          {copy.landing.nowLine(now)}
        </span>
      ) : null}
    </Link>
  );
}
