import { describe, expect, it } from "vitest";
import { destinationOf, needsPreviewCookie, parseView, seatGroups, viewHref, type ViewTarget } from "./view-as";

const ev = { id: "11111111-1111-4111-8111-111111111111", slug: "demo-cup-sim-ab12c" };
const seat = (id: string, name: string, role: "judge" | "head" | "spotter" | "announcer", seatNo: number | null = null) => ({ id, name, role, seatNo });

describe("View as links", () => {
  it("every target survives the round trip through its link", () => {
    const targets: ViewTarget[] = [
      { kind: "spectator" },
      { kind: "live" },
      { kind: "results" },
      { kind: "ladder" },
      { kind: "rider", entryId: "22222222-2222-4222-8222-222222222222" },
      { kind: "screen" },
      { kind: "seat", seatId: "33333333-3333-4333-8333-333333333333" },
      { kind: "head-organiser" },
    ];
    for (const t of targets) {
      const href = viewHref(ev.id, t);
      expect(href.startsWith(`/org/events/${ev.id}/simulate/view?`)).toBe(true);
      expect(parseView(new URL(href, "https://x.test").searchParams)).toEqual(t);
    }
  });
  it("refuses a link it does not understand", () => {
    expect(parseView(new URLSearchParams("as=nonsense"))).toBeNull();
    expect(parseView(new URLSearchParams("as=seat"))).toBeNull();
    expect(parseView(new URLSearchParams("as=seat&seat=not-a-uuid"))).toBeNull();
    expect(parseView(new URLSearchParams("as=rider&entry=nope"))).toBeNull();
    expect(parseView(new URLSearchParams(""))).toBeNull();
  });
  it("sends the public views to the real public pages of the event", () => {
    expect(destinationOf({ kind: "spectator" }, ev)).toBe(`/e/${ev.slug}`);
    expect(destinationOf({ kind: "live" }, ev)).toBe(`/e/${ev.slug}/live`);
    expect(destinationOf({ kind: "results" }, ev)).toBe(`/e/${ev.slug}/results`);
    expect(destinationOf({ kind: "ladder" }, ev)).toBe(`/e/${ev.slug}/ladder`);
    expect(destinationOf({ kind: "rider", entryId: "e1" }, ev)).toBe(`/e/${ev.slug}/riders/e1`);
    expect(destinationOf({ kind: "screen" }, ev)).toBe(`/screen/${ev.slug}`);
  });
  it("sends each official to the screen of their role", () => {
    expect(destinationOf({ kind: "seat", seatId: "s" }, ev, "judge")).toBe(`/judge/${ev.id}`);
    expect(destinationOf({ kind: "seat", seatId: "s" }, ev, "spotter")).toBe(`/spot/${ev.id}`);
    expect(destinationOf({ kind: "seat", seatId: "s" }, ev, "head")).toBe(`/head/${ev.id}`);
    expect(destinationOf({ kind: "seat", seatId: "s" }, ev, "announcer")).toBe(`/head/${ev.id}?mode=announcer`);
    expect(destinationOf({ kind: "head-organiser" }, ev)).toBe(`/head/${ev.id}`);
  });
  it("only the public views need the preview switched on", () => {
    for (const k of ["spectator", "live", "results", "ladder", "screen"] as const) expect(needsPreviewCookie({ kind: k })).toBe(true);
    expect(needsPreviewCookie({ kind: "rider", entryId: "e" })).toBe(true);
    expect(needsPreviewCookie({ kind: "seat", seatId: "s" })).toBe(false);
    expect(needsPreviewCookie({ kind: "head-organiser" })).toBe(false);
  });
});

describe("the officials as buttons", () => {
  const groups = seatGroups([
    seat("s5", "Announcer", "announcer"),
    seat("s3", "Judge 3", "judge", 3),
    seat("s1", "Judge 1", "judge", 1),
    seat("s4", "Head judge", "head"),
    seat("s2", "Judge 2", "judge", 2),
    seat("s6", "Spotter 1", "spotter"),
  ]);
  it("judges by their place on the panel, then spotters, head judge and announcer", () => {
    expect(groups.map((g) => g.role)).toEqual(["judge", "spotter", "head", "announcer"]);
    expect(groups[0].seats.map((s) => s.name)).toEqual(["Judge 1", "Judge 2", "Judge 3"]);
  });
  it("a group with nobody in it is left out", () => {
    expect(seatGroups([seat("s1", "Judge 1", "judge", 1)]).map((g) => g.role)).toEqual(["judge"]);
  });
});
