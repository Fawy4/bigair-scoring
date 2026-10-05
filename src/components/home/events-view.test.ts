import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { groupOrgEvents } from "@/lib/platform/event-label";
import type { LandingEvent } from "@/components/landing-event-card";
import { EventsView } from "./events-view";

const ev = (n: number, status: string, start = "2026-10-10", end = "2026-10-11"): LandingEvent => ({ id: `e${n}`, name: `Event ${n}`, slug: `event-${n}`, location: "El Gouna", start_date: start, end_date: end, status, organisation_name: "Arrow" });
const html = (events: LandingEvent[], nows: Array<string | null> = []) => {
  const groups = groupOrgEvents(events, "2026-10-09");
  return renderToStaticMarkup(createElement(EventsView, { groups, nowLines: nows }));
};

describe("home page events", () => {
  it("nothing public: one clean sentence, no cards", () => {
    const out = html([]);
    expect(out).toContain("No public events right now");
    expect(out).not.toContain("landing-event");
  });
  it("one live event: the live card is first and larger, with the live dot and what is on now", () => {
    const out = html([ev(1, "published", "2026-11-01", "2026-11-02"), ev(2, "live")], ["Pro Men · R1 · Heat 3"]);
    expect(out.indexOf("Live now")).toBeLessThan(out.indexOf("Coming up"));
    expect(out).toContain("home-card featured");
    expect(out).toContain('data-testid="live-dot"');
    expect(out).toContain("Now: Pro Men · R1 · Heat 3");
    expect(out.match(/home-card featured/g)).toHaveLength(1);
  });
  it("ten events: live first, then coming up, then results with a quiet Results tag; every card is one link to its event page", () => {
    const list = [ev(1, "live"), ...[2, 3, 4, 5].map((n) => ev(n, "published", "2026-12-01", "2026-12-02")), ...[6, 7, 8, 9, 10].map((n) => ev(n, "complete", "2026-09-01", "2026-09-02"))];
    const out = html(list, ["Pro Men · R1 · Heat 1"]);
    expect(out.match(/data-testid="landing-event"/g)).toHaveLength(10);
    expect(out.indexOf('data-testid="live-events"')).toBeLessThan(out.indexOf('data-testid="upcoming-events"'));
    expect(out.indexOf('data-testid="upcoming-events"')).toBeLessThan(out.indexOf('data-testid="recent-events"'));
    expect(out.match(/home-tag">Results</g)).toHaveLength(5);
    expect(out).toContain('href="/e/event-7"');
  });
  it("a live event with nothing on right now still says Live now", () => {
    expect(html([ev(1, "live")], [null])).toContain("Live now");
  });
});
