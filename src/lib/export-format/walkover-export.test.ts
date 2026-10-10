// Console – Walkover and absent riders: the public pages, the ladder and the results file say Walkover / Did not start / Out of the event, never 0.0.
import { describe, expect, it } from "vitest";
import { buildLadder } from "@/lib/public/ladder-model";
import { buildHeatTabs } from "@/lib/public/results-model";
import { expandFormat } from "@/lib/engine/ladder/expand";
import { heat as heatOf, loadFormat, makeEntrants, publishRound, round } from "@/lib/engine/ladder/fixtures";
import { applyHeatResult, lockDraw, withdrawEntrant } from "@/lib/engine/ladder";
import { walkoverRanking } from "@/lib/engine/ladder/walkover";
import { defaultScheme } from "@/lib/schemas/identification";
import type { PublicEntry, PublicResults, PublicRules, PublicSite, ResultsHeat } from "@/lib/public/types";
import { buildResultsCsv, type ResultsExportInput } from "./results-export";

const entries: PublicEntry[] = [
  { id: "e1", division_id: "d1", first_name: "Adam", last_name: "Arrow", nationality: "EG", identifiers: null },
  { id: "e2", division_id: "d1", first_name: "Mariam", last_name: "Graff", nationality: "EG", identifiers: null },
  { id: "e3", division_id: "d1", first_name: "Omar", last_name: "Hassan", nationality: "EG", identifiers: null, withdrawn: true },
];
const site = {
  found: true,
  event: { id: "ev", name: "Test Open", slug: "test-open", location: null, start_date: "2026-10-09", end_date: null, status: "live", timezone: "Africa/Cairo" },
  organisation: { name: "Org", slug: "org", logo_url: null },
  branding: { logoUrl: null, sponsors: [] },
  settings: { windCallBanner: true, readyCallMin: 10, livePollSec: 7, screenRotateSec: 20, screenColourMode: "dark", publicTabsOff: [], registrationOpen: false, externalLeaderboards: [], identification: null, publicLiveScores: "after_publish" },
  wind: null,
  divisions: [{ id: "d1", name: "Pro Men", description: null, sort_order: 0, identification: null, attempt_display: "number_score", show_percent: false, drawn: true }],
} as unknown as PublicSite;
const rules = { allowed: true, impression_name: null, divisions: [{ id: "d1", name: "Pro Men", description: null, identification: null, scoring_model: null, scoring_overrides: {}, format_template: null, format_params: {}, riders: 3 }] } as unknown as PublicRules;

const walkoverHeat: ResultsHeat = {
  id: "h1", number: 11, suffix: null, name: null, draw_uid: null, status: "published", held: false, rerun_of: null, rerun_id: null, published_at: "2026-10-09T12:00:00Z", draw_round: null, draw_index: null,
  slots: [
    { position: 1, entry_id: "e1", vest_colour: null, modifier: null, source: null },
    { position: 2, entry_id: "e2", vest_colour: null, modifier: "DNS", source: null },
    { position: 3, entry_id: "e3", vest_colour: null, modifier: "DNS", source: null },
  ],
  results: [
    { entry_id: "e1", place: 1, total: null, percent: null, breakdown: { status: "WO" } as never, version: 1 },
    { entry_id: "e2", place: 2, total: null, percent: null, breakdown: { status: "DNS" } as never, version: 1 },
    { entry_id: "e3", place: 3, total: null, percent: null, breakdown: { status: "OUT" } as never, version: 1 },
  ],
};
const results = { allowed: true, event: { id: "ev", name: "Test Open", slug: "test-open", timezone: "Africa/Cairo" }, poll_sec: 7, entries, divisions: [{ id: "d1", name: "Pro Men", sort_order: 0, attempt_display: "number_score", show_percent: false, highest_jump: null, rounds: [{ id: "r1", name: "Round 3", short_name: "R3", sort_order: 0, heats: [walkoverHeat] }] }] } as unknown as PublicResults;
const input = (): ResultsExportInput => ({ exportedAt: "2026-10-09T12:05:00Z", site, results, rules, draw: null, draftHeatIds: new Set(), includeDraft: false, publishers: new Map() });

describe("the public results page", () => {
  const tab = buildHeatTabs(results, site, rules)[0];
  it("the heat is complete; the winner is 1st and a Walkover, the others follow in words, nobody has a total", () => {
    expect(tab.state).toBe("complete");
    expect(tab.riders.map((r) => [r.place, r.state, r.totalLabel, r.formula])).toEqual([[1, "WO", null, null], [2, "DNS", null, null], [3, "OUT", null, null]]);
  });
  it("a seat of a heat that has not been published reads Did not start, or Out of the event for a rider who is out", () => {
    const upcoming: ResultsHeat = { ...walkoverHeat, id: "h2", number: 12, status: "scheduled", results: [] };
    const r2 = { ...results, divisions: [{ ...results.divisions[0], rounds: [{ ...results.divisions[0].rounds[0], heats: [upcoming] }] }] } as PublicResults;
    expect(buildHeatTabs(r2, site, rules)[0].riders.map((r) => r.state)).toEqual(["ok", "DNS", "OUT"]);
  });
});

describe("the results file", () => {
  const { csv } = buildResultsCsv(input());
  const lines = csv.split("\r\n");
  it("says Walkover, Did not start and Out of the event as the rider status", () => {
    expect(lines.filter((l) => /,Walkover,/.test(l))).toHaveLength(1);
    expect(lines.filter((l) => /,Did not start,/.test(l))).toHaveLength(1);
    expect(lines.filter((l) => /,Out of the event,/.test(l))).toHaveLength(1);
  });
  it("never writes 0 or 0.00 as the total of a rider who did not ride", () => {
    for (const l of lines.filter((x) => /Walkover|Did not start|Out of the event/.test(x))) expect(l).not.toMatch(/,0(\.0+)?,/);
  });
});

describe("the ladder", () => {
  const draw0 = lockDraw(expandFormat(loadFormat("kota-dingle"), makeEntrants(12)));
  const scheme = defaultScheme();
  it("a walkover winner reads Walkover and the rider who did not start reads Did not start, both with no total", () => {
    let d = publishRound(draw0, "R1");
    const hh = round(d, "R2").heats.find((x) => x.slots.length === 2)!;
    const [a, b] = hh.slots.map((s) => s.entrantId!);
    d = applyHeatResult(d, hh.id, walkoverRanking([{ entrantId: a }, { entrantId: b, modifier: "DNS" }])).draw;
    const division = { rounds: [{ heats: [{ id: "db", draw_uid: hh.uid ?? hh.id, status: "published", held: false }] }] } as never;
    const r2 = buildLadder(d, division, scheme).find((r) => r.id === "R2")!;
    const card = r2.heats.find((h) => h.name.includes(String(heatOf(d, hh.id).number)))!;
    const byName = (id: string) => card.riders.find((r) => r.entryId === id)!;
    expect(byName(a)).toMatchObject({ note: "Walkover", totalLabel: "—" });
    expect(byName(b)).toMatchObject({ note: "Did not start", totalLabel: "—" });
  });
  it("a rider who is Out of the event reads Out of the event on every seat he holds", () => {
    let d = withdrawEntrant(draw0, "r5");
    d = publishRound(d, "R1");
    const seat = round(d, "R2").heats.flatMap((h) => h.slots).find((s) => s.entrantId === "r5")!;
    expect(seat.modifier).toBe("DNS");
    const r2 = buildLadder(d, undefined, scheme).find((r) => r.id === "R2")!;
    expect(r2.heats.flatMap((h) => h.riders).find((r) => r.entryId === "r5")!.note).toBe("Out of the event");
  });
});
