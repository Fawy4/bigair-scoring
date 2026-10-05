import type { LandingEvent } from "@/components/landing-event-card";
import { copy } from "@/lib/ui-copy";
import { HomeEventCard } from "./home-event-card";

const L = copy.landing;
export const SHOWN = { upcoming: 40, recent: 8 };

export interface HomeGroups {
  live: LandingEvent[];
  upcoming: LandingEvent[];
  past: LandingEvent[];
}

/** The events of the home page, as pure markup: live first (the first live event larger), then coming up, then results; a clean empty state when nothing is public. */
export function EventsView({ groups, nowLines, failed }: { groups: HomeGroups; nowLines: Array<string | null>; failed?: boolean }) {
  const section = (id: string, heading: string, list: LandingEvent[], opts: { nowLines?: Array<string | null>; finished?: boolean } = {}) =>
    list.length === 0 ? null : (
      <section aria-labelledby={id} className="home-section" data-testid={id}>
        <h2 id={id} className="home-label">
          {heading}
        </h2>
        <ul className="home-grid">
          {list.map((e, i) => {
            const featured = id === "live-events" && i === 0;
            return (
              <li key={e.id} className={featured ? "featured" : undefined}>
                <HomeEventCard event={e} now={opts.nowLines?.[i] ?? null} featured={featured} finished={opts.finished} />
              </li>
            );
          })}
        </ul>
      </section>
    );

  if (failed) {
    return (
      <p role="alert" className="home-alert">
        {copy.common.problem(L.loadError)}
      </p>
    );
  }
  if (groups.live.length + groups.upcoming.length + groups.past.length === 0) {
    return (
      <p className="home-empty" data-testid="home-empty">
        {L.noPublic}
      </p>
    );
  }
  return (
    <>
      {section("live-events", L.liveHeading, groups.live, { nowLines })}
      {section("upcoming-events", L.upcomingHeading, groups.upcoming.slice(0, SHOWN.upcoming))}
      {section("recent-events", L.recentHeading, groups.past.slice(0, SHOWN.recent), { finished: true })}
    </>
  );
}
