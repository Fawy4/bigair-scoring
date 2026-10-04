import { describe, expect, it } from "vitest";
import { computeHeat } from "@/lib/engine/scoring";
import { crashed, hetx, impressions, J3, landed, preset } from "@/lib/engine/scoring/fixtures";
import type { PublicEntry, PublicResults, PublicRules, PublicSite, ResultsHeat } from "@/lib/public/types";
import { csvCell, CSV_BOM, toCsv } from "./csv";
import { buildResultsCsv, exportedHeats, exportFileName, localStamp, type ResultsExportInput } from "./results-export";
import { draftRow } from "./public-breakdown";

// The known heat is docs/08-TEST-SCENARIOS.md §1A: KOTA preset, rider "Red", five attempts. Expected: panel 7.71 / 8.25 / 7.29 / crash / 8.08, counted 2, 5, 1,
// tricks 24.04, impression 7.50, total 31.54, first place.
const model = preset("kota-best3-impression");
const attempts = [
  landed(1, [hetx(8.0, 7.5, 7.0, 8.0), hetx(8.5, 8.0, 7.0, 7.5), hetx(8.0, 7.5, 7.5, 8.0)], { trickName: "Kiteloop board-off" }),
  landed(2, [hetx(9.0, 9.0, 8.0, 7.0), hetx(9.0, 8.5, 8.0, 7.5), hetx(8.5, 9.0, 8.5, 7.0)], { trickName: "Double loop" }),
  landed(3, [hetx(7.0, 7.0, 6.5, 8.5), hetx(7.5, 7.0, 7.0, 8.0), hetx(7.0, 6.5, 7.0, 8.5)], { trickName: "Late backroll kiteloop" }),
  crashed(4, { trickName: "Board-off" }),
  landed(5, [hetx(8.5, 8.0, 7.5, 8.5), hetx(8.0, 8.0, 8.0, 8.0), hetx(8.5, 8.5, 7.5, 8.0)], { trickName: "Contra loop" }),
];
const computed = computeHeat(model, { panelJudgeIds: J3, riders: [{ riderId: "e-red", attempts, impressionMarks: impressions([7.5, 7.0, 8.0]) }] });
const red = computed.riders[0];
const redPlace = computed.ranking.find((x) => x.riderId === "e-red")!.place;

const entries: PublicEntry[] = [{ id: "e-red", division_id: "d1", first_name: "Sam", last_name: "Rivera", nationality: "EG", identifiers: null }];
const site = {
  found: true,
  event: { id: "ev", name: "Test Open", slug: "test-open", location: null, start_date: "2026-10-04", end_date: null, status: "live", timezone: "Africa/Cairo" },
  organisation: { name: "Org", slug: "org", logo_url: null },
  branding: { logoUrl: null, sponsors: [] },
  settings: { windCallBanner: true, readyCallMin: 10, livePollSec: 7, screenRotateSec: 20, screenColourMode: "dark", publicTabsOff: [], registrationOpen: false, externalLeaderboards: [], identification: null, publicLiveScores: "after_publish" },
  wind: null,
  divisions: [{ id: "d1", name: "Pro Men", description: null, sort_order: 0, identification: null, attempt_display: "number_score", show_percent: false, drawn: true }],
} as unknown as PublicSite;
const rules = { allowed: true, impression_name: null, divisions: [{ id: "d1", name: "Pro Men", description: null, identification: null, scoring_model: model, scoring_overrides: {}, format_template: null, format_params: {}, riders: 1 }] } as unknown as PublicRules;

function heatOf(id: string, status: string, opts: { held?: boolean; withResult?: boolean; number: number } = { number: 1 }): ResultsHeat {
  return {
    id,
    number: opts.number,
    suffix: null,
    name: null,
    draw_uid: null,
    status,
    held: opts.held ?? false,
    rerun_of: null,
    rerun_id: null,
    published_at: "2026-10-04T11:32:10Z",
    draw_round: null,
    draw_index: null,
    slots: [{ position: 1, entry_id: "e-red", vest_colour: "red", modifier: null, source: null }],
    results: opts.withResult ? [draftRow("e-red", { place: redPlace, total: red.total, percent: red.percent, breakdown: red as never }, 1)] : [],
  };
}

function inputWith(heats: ResultsHeat[], extra: Partial<ResultsExportInput> = {}): ResultsExportInput {
  const results = { allowed: true, event: { id: "ev", name: "Test Open", slug: "test-open", timezone: "Africa/Cairo" }, poll_sec: 7, entries, divisions: [{ id: "d1", name: "Pro Men", sort_order: 0, attempt_display: "number_score", show_percent: false, highest_jump: null, rounds: [{ id: "r1", name: "Round 1", short_name: "R1", sort_order: 0, heats }] }] } as unknown as PublicResults;
  return { exportedAt: "2026-10-04T12:00:00Z", site, results, rules, draw: null, draftHeatIds: new Set(), includeDraft: false, publishers: new Map(), ...extra };
}

describe("csv writer", () => {
  it("quotes only when it must, doubles quotes, uses CRLF", () => {
    expect(toCsv([["a", "b,c", 'say "hi"', 1.5, null], []])).toBe('a,"b,c","say ""hi""",1.5,\r\n\r\n');
  });
  it("never lets a text cell run as a formula", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-1 point")).toBe("'-1 point");
    expect(csvCell(-1)).toBe("-1");
  });
});

describe("results CSV — docs/08 §1A heat", () => {
  it("the engine gives the numbers the test scenario promises", () => {
    expect(red.total).toBe(31.54);
    expect(redPlace).toBe(1);
  });

  it("one row per rider per released heat, every attempt in order, with exactly the expected cells", () => {
    const { csv, heatCount } = buildResultsCsv(inputWith([heatOf("h1", "published", { withResult: true, number: 1 })], { publishers: new Map([["h1", "Head Judge Fawy"]]) }));
    expect(heatCount).toBe(1);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(
      "Division,Round,Heat,Draft,Rider label,Rider,Lycra,Rider status," +
        "Attempt 1 trick,Attempt 1 result,Attempt 1 score,Attempt 1 counted,Attempt 2 trick,Attempt 2 result,Attempt 2 score,Attempt 2 counted,Attempt 3 trick,Attempt 3 result,Attempt 3 score,Attempt 3 counted," +
        "Attempt 4 trick,Attempt 4 result,Attempt 4 score,Attempt 4 counted,Attempt 5 trick,Attempt 5 result,Attempt 5 score,Attempt 5 counted," +
        "Impression score,Heat total,Place in heat,Result version,Published by,Published at",
    );
    expect(lines[1]).toBe(
      "Pro Men,R1,Heat 1,,Sam Rivera,Sam Rivera,Red,Riding," +
        "Kiteloop board-off,Landed,7.71,Yes,Double loop,Landed,8.25,Yes,Late backroll kiteloop,Landed,7.29,No,Board-off,Crashed,,No,Contra loop,Landed,8.08,Yes," +
        "7.50,31.54,1,1,Head Judge Fawy,2026-10-04 14:32",
    );
  });

  it("a heat that is not released is never in the file; a draft heat only when asked, and it says DRAFT with no version", () => {
    const heats = [heatOf("h1", "published", { withResult: true, number: 1 }), heatOf("h2", "under_review", { number: 2 }), heatOf("h3", "published", { held: true, number: 3 })];
    const plain = exportedHeats(inputWith(heats));
    expect(plain.map((h) => h.heat.id)).toEqual(["h1"]);

    // the loader lays a draft heat in as an ordinary released row and names it; without the box it is still left out
    const laid = [heatOf("h1", "published", { withResult: true, number: 1 }), heatOf("h2", "published", { withResult: true, number: 2 })];
    laid[1].results = [draftRow("e-red", { place: redPlace, total: red.total, percent: null, breakdown: red as never })];
    expect(exportedHeats(inputWith(laid, { draftHeatIds: new Set(["h2"]), includeDraft: false })).map((h) => h.heat.id)).toEqual(["h1"]);
    const withDraft = buildResultsCsv(inputWith(laid, { draftHeatIds: new Set(["h2"]), includeDraft: true }));
    expect(withDraft.heatCount).toBe(2);
    const row = withDraft.csv.slice(1).split("\r\n")[2];
    expect(row.startsWith("Pro Men,R1,Heat 2,DRAFT,")).toBe(true);
    expect(row.endsWith("7.50,31.54,1,,,")).toBe(true);
  });

  it("the impression column carries the event's own name for it", () => {
    const named = { ...rules, impression_name: "Variety" } as PublicRules;
    const { csv } = buildResultsCsv({ ...inputWith([heatOf("h1", "published", { withResult: true, number: 1 })]), rules: named });
    expect(csv.split("\r\n")[0]).toContain("Variety score,Heat total");
  });

  it("names the file after the event, the day and the time in the event's time zone", () => {
    expect(localStamp("2026-10-04T11:32:10Z", "Africa/Cairo")).toBe("2026-10-04 14:32");
    expect(exportFileName("test-open", "backup", "json", "2026-10-04T11:32:10Z", "Africa/Cairo")).toBe("test-open-backup-2026-10-04-1432.json");
  });
});

describe("printable order", () => {
  it("is division by division with the newest heat first, a draft heat above them", async () => {
    const { printOrder } = await import("./results-export");
    const mk = (id: string, number: number, at: string | null) => ({ ...heatOf(id, "published", { withResult: true, number }), published_at: at });
    const heats = [mk("h1", 1, "2026-10-04T09:00:00Z"), mk("h2", 2, "2026-10-04T10:00:00Z"), mk("h3", 3, null)];
    heats[2].results = [draftRow("e-red", { place: redPlace, total: red.total, percent: null, breakdown: red as never })];
    const input = inputWith(heats, { draftHeatIds: new Set(["h3"]), includeDraft: true });
    expect(printOrder(exportedHeats(input))[0].heats.map((h) => h.heat.id)).toEqual(["h3", "h2", "h1"]);
  });
});
