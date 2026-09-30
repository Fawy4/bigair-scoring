import Link from "next/link";
import { eventLabel } from "@/lib/platform/event-label";
import { copy } from "@/lib/ui-copy";

export interface PublicEvent {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

/** One published event: its name, then "Organisation · Location · Date". Live and finished events say so in words. */
export function EventCard({ event, organisation }: { event: PublicEvent; organisation: string | null }) {
  return (
    <Link href={`/e/${event.slug}`} className="block rounded-lg border-2 border-[#111] p-3 hover:bg-[#eee]">
      <span className="block text-xl font-bold">{event.name}</span>
      <span className="block text-base font-semibold">
        {eventLabel({ organisation, location: event.location, startDate: event.start_date, endDate: event.end_date })}
        {event.status === "live" ? copy.landing.live : event.status === "complete" ? copy.landing.finished : ""}
      </span>
    </Link>
  );
}
