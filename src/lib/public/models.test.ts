import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyHeatResult, expandFormat, type DivisionDraw } from "@/lib/engine/ladder";
import { lycraScheme } from "@/lib/schemas/identification";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import { gradeIndex } from "@/lib/live/result-shading";
import { buildLadder, buildPlacings, highestJumpLine } from "./ladder-model";
import { liveRows } from "./live-model";
import { buildHeatTabs, defaultHeatId, formulaLine } from "./results-model";
import { buildRiderPage } from "./rider-model";
import { buildRules } from "./rules-model";
import { buildPublicTimetable } from "./timetable";
import { whatsappLink } from "./share";
import type { PublicBreakdown, PublicEntry, PublicLiveHeat, PublicResults, PublicRules, PublicSite, PublicTimetable, ResultsHeat } from "./types";
import { parseScoringModel } from "@/lib/schemas/scoring-model";

const legacy = JSON.parse(readFileSync("presets/scoring/legacy-kol-best3-variety.json", "utf8"));
const NAMES = ["Ana Ladder", "Ben Ladder", "Cy Ladder", "Di Ladder", "Eli Ladder", "Flo Ladder"];
const IDS = NAMES.map((_, i) => `e${i + 1}`);

const site = (scheme?: unknown): PublicSite => ({
  found: true,
  event: { id: "ev", name: "Test Cup", slug: "test-cup", location: "El Gouna", start_date: "2026-10-10", end_date: "2026-10-11", status: "live", timezone: "Africa/Cairo" },
  organisation: { name: "Org", slug: "org", logo_url: null },
  branding: { logoUrl: null, sponsors: [] },
  settings: { windCallBanner: true, readyCallMin: 10, livePollSec: 7, screenRotateSec: 20, screenColourMode: "dark", publicTabsOff: [], registrationOpen: false, externalLeaderboards: [], identification: scheme ? { scheme, allowDivisionOverride: false } : null, publicLiveScores: "live" },
  wind: null,
  divisions: [{ id: "d1", name: "Pro Men", description: null, sort_order: 1, identification: null, attempt_display: "number_score", show_percent: false, drawn: true }],
});

const entries: PublicEntry[] = NAMES.map((n, i) => ({ id: IDS[i], division_id: "d1", first_name: n.split(" ")[0], last_name: n.split(" ")[1], nationality: "EG", identifiers: null }));

function template(reseed: "by_original_seed" | "by_heat_score") {
  return parseFormatTemplate({
    id: "t", name: "Knockout", entrants: { min: 2, max: null }, timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 2, defaultBreakAfterRoundMin: 3 }, kind: "generator",
    generator: { type: "single_elimination", params: { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2, reseed } },
  });
}
const baseDraw = (reseed: "by_original_seed" | "by_heat_score") => expandFormat(template(reseed), IDS.map((id, i) => ({ id, name: NAMES[i] })), { identification: "vests-per-heat" });

const breakdown = (total: number, tricks: Array<[string, number | null, boolean]>, impression = 5): PublicBreakdown => ({
  status: "ok", total, totalLabel: total.toFixed(1),
  components: { tricks: total - impression, impression, bonus: 0, penalty: 0 },
  counted: [],
  allAttempts: tricks.map(([name, score, counted], i) => ({ seq: i + 1, status: score === null ? "crashed" : "landed", trickName: name, categoryKey: null, score, counted, panelScore: score })),
  impression: { score: impression }, landedCount: tricks.filter((t) => t[1] !== null).length, attemptCount: tricks.length, attemptCap: 7, modifiers: [],
});

/** A heat as get_public_results returns it. */
function heatRow(id: string, uid: string, number: number, status: string, riders: string[], opts: { held?: boolean; results?: PublicBreakdown[]; publishedAt?: string; colours?: string[] } = {}): ResultsHeat {
  return {
    id, number, suffix: null, name: null, draw_uid: uid, status, held: Boolean(opts.held), rerun_of: null, rerun_id: null, published_at: opts.publishedAt ?? null, draw_round: null, draw_index: null,
    slots: riders.map((r, i) => ({ position: i + 1, entry_id: r || null, vest_colour: opts.colours?.[i] ?? null, modifier: null, source: null })),
    results: status === "published" && !opts.held ? riders.map((r, i) => ({ entry_id: r, place: i + 1, total: opts.results![i].total, percent: 50, breakdown: opts.results![i], version: 1 })) : [],
  };
}

function results(heats: ResultsHeat[], extra: Partial<PublicResults["divisions"][number]> = {}): PublicResults {
  return {
    allowed: true, event: { id: "ev", name: "Test Cup", slug: "test-cup", timezone: "Africa/Cairo" }, poll_sec: 7, entries,
    divisions: [{ id: "d1", name: "Pro Men", sort_order: 1, attempt_display: "number_score", show_percent: false, highest_jump: null, rounds: [{ id: "r1", name: "Round 1", short_name: "R1", sort_order: 1, heats }], ...extra }],
  };
}
const rules = (): PublicRules => ({ allowed: true, divisions: [{ id: "d1", name: "Pro Men", description: null, identification: null, scoring_model: legacy, scoring_overrides: {}, format_template: template("by_original_seed"), format_params: {}, riders: 6 }] });

const H1 = [breakdown(20, [["Backroll", 7, true], ["Frontroll", 5.5, true], ["Kiteloop", 4, true], ["Megaloop", null, false]]), breakdown(15, [["Backroll", 4, true], ["Frontroll", 3, false]], 6), breakdown(10, [["Backroll", 2, true]], 5)];

describe("the heat summary (results tabs)", () => {
  const heats = [heatRow("h1", "R1-H1", 1, "published", ["e1", "e2", "e3"], { results: H1, publishedAt: "2026-10-10T07:00:00Z" }), heatRow("h2", "R1-H2", 2, "running", ["e4", "e5", "e6"])];
  const tabs = buildHeatTabs(results(heats), site(), rules());

  it("a released heat is one row per rider in rank order: label, place, total, the formula in words, no percentage, boxes in attempt order", () => {
    const t = tabs[0];
    expect(t.state).toBe("complete");
    expect(t.title).toBe("Pro Men · R1 · Heat 1");
    expect(t.riders.map((r) => r.place)).toEqual([1, 2, 3]);
    expect(t.riders[0].label?.primary.text).toBe("Ana Ladder");
    expect(t.riders[0].totalLabel).toBe("20.0");
    expect(t.riders[0].formula).toBe("20.0 = tricks 15.0 + Variety 5.0");
    expect(t.riders[0].percentLabel).toBeNull();
    expect(t.riders[0].boxes.map((b) => [b.seq, b.status, b.counted, b.scoreLabel])).toEqual([[1, "landed", true, "7.0"], [2, "landed", true, "5.5"], [3, "landed", true, "4.0"], [4, "crashed", false, null]]);
    expect(t.countedScores.sort()).toEqual([2, 4, 4, 5.5, 7].sort());
    expect(t.attemptsPerRider).toBe(7);
    expect(t.mode).toBe("number_score");
  });

  it("the grading runs across the heat: the highest counted score is the greenest, the lowest the yellowest", () => {
    const t = tabs[0];
    expect(gradeIndex(7, Math.min(...t.countedScores), Math.max(...t.countedScores))).toBe(4);
    expect(gradeIndex(2, Math.min(...t.countedScores), Math.max(...t.countedScores))).toBe(0);
  });

  it("a heat that is running or still to come shows the seats only, with no totals", () => {
    const t = tabs[1];
    expect(t.state).toBe("live");
    expect(t.riders.map((r) => [r.place, r.totalLabel, r.boxes.length])).toEqual([[null, null, 0], [null, null, 0], [null, null, 0]]);
  });

  it("a held heat shows no result and no rider total, only its seats", () => {
    const held = buildHeatTabs(results([heatRow("h1", "R1-H1", 1, "published", ["e1", "e2", "e3"], { held: true, results: H1 })]), site(), rules());
    expect(held[0].state).toBe("held");
    expect(held[0].riders.every((r) => r.totalLabel === null && r.boxes.length === 0)).toBe(true);
  });

  it("the percentage appears only when the division's setting is on; the stored 'score_only' setting is read as scores only", () => {
    const on = buildHeatTabs(results([heats[0]], { show_percent: true, attempt_display: "score_only" }), site(), rules());
    expect(on[0].riders[0].percentLabel).toBe("50 % of maximum");
    expect(on[0].mode).toBe("scores_only");
  });

  it("the formula adds a bonus or takes a penalty off in words, and reads without an Impression score when the model has none", () => {
    expect(formulaLine("18.20", { tricks: 14, impression: 4.7, bonus: 0, penalty: 0.5 }, "Impression", 2)).toBe("18.20 = tricks 14.00 + Impression 4.70 − penalty 0.50");
    expect(formulaLine("14.00", { tricks: 14, impression: 0, bonus: 1, penalty: 0 }, null, 2)).toBe("14.00 = tricks 14.00 + bonus 1.00");
  });

  it("the leaderboard opens on the live heat, otherwise the last released heat", () => {
    expect(defaultHeatId(tabs, null)).toBe("h2");
    expect(defaultHeatId([tabs[0]], null)).toBe("h1");
    expect(defaultHeatId(tabs, "h1")).toBe("h1");
  });

  it("Lycra seats carry the colour word and the colour block; riders with no entry yet read 'waiting'", () => {
    const t = buildHeatTabs(results([heatRow("h2", "R1-H2", 2, "scheduled", ["e4", "", "e6"], { colours: ["red", "blue", "yellow"] })]), site(lycraScheme()), rules());
    expect(t[0].riders[0].label?.primary).toMatchObject({ text: "RED", kind: "colour" });
    expect(t[0].riders[1].placeholder).toBe("Waiting for an earlier heat");
  });
});

describe("the ladder", () => {
  it("fixed seats: a released heat's winner sits in the Final with the totals shown; the other seat is a placeholder", () => {
    const d0 = baseDraw("by_original_seed");
    const r1 = d0.rounds[0].heats[0];
    const ranked = r1.slots.map((s, i) => ({ entrantId: s.entrantId!, place: i + 1, total: 20 - i, tieKeys: [] }));
    const draw = applyHeatResult(d0, r1.id, { ranked }).draw;
    const rows = [heatRow("h1", "R1-H1", 1, "published", ["e1", "e4", "e5"], { results: H1 }), heatRow("h2", "R1-H2", 2, "scheduled", ["e2", "e3", "e6"])];
    const ladder = buildLadder(draw, { rounds: [{ id: "r1", name: "Round 1", short_name: "R1", sort_order: 1, heats: rows }] }, lycraScheme(), 1);
    expect(ladder.map((r) => r.name)).toEqual(["Round 1", "Final"]);
    const first = ladder[0].heats[0];
    expect(first.state).toBe("complete");
    expect(first.riders[0]).toMatchObject({ name: "Ana Ladder", totalLabel: "20.0", colourWord: "Red", hex: expect.stringMatching(/^#/) });
    const final = ladder[1].heats[0];
    expect(final.riders[0]).toMatchObject({ name: "Ana Ladder", placeholder: false });
    expect(final.riders[1]).toMatchObject({ name: "1st H2", placeholder: true, pending: false });
  });

  it("a round dealt from all arrivals: the seat says who is on the way, 'Ana Ladder · 1st H1 · seat pending'", () => {
    const d0 = baseDraw("by_heat_score");
    const r1 = d0.rounds[0].heats[0];
    const ranked = r1.slots.map((s, i) => ({ entrantId: s.entrantId!, place: i + 1, total: 20 - i, tieKeys: [] }));
    const draw = applyHeatResult(d0, r1.id, { ranked }).draw;
    const ladder = buildLadder(draw, undefined, lycraScheme());
    const final = ladder[1].heats[0];
    expect(final.riders[0].pending ? final.riders[0].name : "").toBe("Ana Ladder · 1st H1 · seat pending");
    expect(final.riders[1].name).toBe("1st H2");
  });

  it("no draw, no ladder", () => expect(buildLadder(null, undefined, lycraScheme())).toEqual([]));
});

describe("placings", () => {
  it("riders knocked out in the same round share a place; the Final gives 1 and 2; the highest jump line names the rider", () => {
    let draw: DivisionDraw = baseDraw("by_original_seed");
    const publish = (d: DivisionDraw, heatId: string): DivisionDraw => {
      const h = d.rounds.flatMap((r) => r.heats).find((x) => x.id === heatId)!;
      return applyHeatResult(d, heatId, { ranked: h.slots.filter((s) => s.entrantId).map((s, i) => ({ entrantId: s.entrantId!, place: i + 1, total: 20 - i, tieKeys: [] })) }).draw;
    };
    draw = publish(publish(draw, "R1-H1"), "R1-H2");
    draw = publish(draw, "F-H1");
    const p = buildPlacings(draw, entries);
    expect(p.map((x) => x.label)).toEqual(["1", "2", "3=", "3=", "3=", "3="]);
    expect(p[0].name).toBe("Ana Ladder");
    const jump = { height_m: 14.237, entry_id: "e1", heat_id: "h1", trick_name: "Left ×2 Backroll" };
    expect(highestJumpLine({ attempt_display: "trick_score", highest_jump: jump }, entries)).toBe("Highest jump: 14.24 m — Ana Ladder (L ×2 BR)");
    // only a division on "trick name + score" names the trick, even if the trick were sent
    for (const mode of ["number_score", "score_only", "scores_only", undefined as unknown as string]) expect(highestJumpLine({ attempt_display: mode, highest_jump: jump }, entries)).toBe("Highest jump: 14.24 m — Ana Ladder");
    expect(highestJumpLine({ attempt_display: "trick_score", highest_jump: { ...jump, trick_name: null } }, entries)).toBe("Highest jump: 14.24 m — Ana Ladder");
    expect(highestJumpLine({ attempt_display: "trick_score", highest_jump: null }, entries)).toBeNull();
    expect(buildPlacings(null, entries)).toEqual([]);
  });
});

describe("the rules page", () => {
  const rv = buildRules(rules(), site(lycraScheme()))[0];
  const text = (key: string) => rv.sections.find((s) => s.key === key)!.lines.join("\n");

  it("is generated from the scoring model and format in plain words", () => {
    expect(rv.summary).toContain("Best 3 of 7 attempts");
    expect(text("scoring")).toContain("Each trick gets one score from 0 to 10, in steps of 0.5.");
    expect(text("scoring")).toContain("A crashed attempt scores nothing and does not count.");
    expect(text("counting")).toContain("The best 3 tricks count.");
    expect(text("counting")).toContain("Each rider has up to 7 attempts in a heat.");
    expect(text("impression")).toContain("Variety: every judge gives every rider one score from 0 to 10.");
    expect(text("judges")).toContain("3 judges");
    expect(text("tiebreakers")).toContain("1. the highest counted trick");
    expect(text("penalties")).toContain("Interference");
    expect(text("penalties")).toContain("did not start (DNS)");
    expect(text("format")).toContain("With 6 riders");
    expect(text("format")).toContain("Round 1: 2 heats · 3 riders · 10 min");
    expect(text("format")).toContain("1st → F");
  });

  it("explains the Lycra scheme and lists the colours with their names", () => {
    expect(text("identification")).toContain("colour of their Lycra");
    expect(text("identification")).toContain("changes from heat to heat");
    expect(rv.legend.map((c) => c.label)).toContain("Red");
  });

  it("says nothing it cannot back: a broken model drops its sections, never the page", () => {
    const bad = rules();
    bad.divisions[0].scoring_model = { nonsense: true };
    const v = buildRules(bad, site())[0];
    expect(v.summary).toBeNull();
    expect(v.sections.map((s) => s.key)).toContain("identification");
    expect(v.sections.map((s) => s.key)).not.toContain("scoring");
  });

  it("criteria models list each criterion", () => {
    const k = JSON.parse(readFileSync("presets/scoring/kota-best3-impression.json", "utf8"));
    const r = rules();
    r.divisions[0].scoring_model = k;
    const v = buildRules(r, site())[0];
    expect(v.sections.find((s) => s.key === "scoring")!.lines[0]).toBe("Each trick is scored on these criteria:");
    expect(v.sections.find((s) => s.key === "scoring")!.lines.length).toBeGreaterThan(3);
  });
});

describe("the rider page", () => {
  const heats = [heatRow("h1", "R1-H1", 1, "published", ["e1", "e2", "e3"], { results: H1, publishedAt: "2026-10-10T07:00:00Z" }), heatRow("h2", "R1-H2", 2, "scheduled", ["e4", "e5", "e6"])];
  const res = results(heats);
  const tabs = buildHeatTabs(res, site(), rules());
  const tt: PublicTimetable = {
    allowed: true, server_now: "2026-10-10T06:00:00Z", timezone: "Africa/Cairo", poll_sec: 7, ready_call_min: 15,
    plans: [{ id: "p", day: "2026-10-10", name: "Main", items: [{ id: "i1", kind: "heat", heatId: "h1" }, { id: "i2", kind: "heat", heatId: "h2" }], anchors: { i1: "10:00" }, actual_starts: {}, hold: null, defaults: { breakAfterHeatMin: 2, breakAfterRoundMin: 3, readyCallMin: 15 } }],
    divisions: [{ id: "d1", name: "Pro Men", sort_order: 1 }], rounds: [{ id: "r1", division_id: "d1", name: "Round 1", short_name: "R1", sort_order: 1 }],
    heats: ["h1", "h2"].map((id, i) => ({ id, division_id: "d1", round_id: "r1", number: i + 1, suffix: null, name: null, status: i === 0 ? "published" : "scheduled", effective_status: "scheduled", held: false, started_at: i === 0 ? "2026-10-10T07:00:00Z" : null, ended_at: i === 0 ? "2026-10-10T07:10:00Z" : null, paused_at: null, paused_total_sec: 0, duration_sec: 600, warm_up_sec: 0, rerun_of: null, round_last: false, break_after_heat_min: 2, break_after_round_min: 3 })),
  };
  const model = buildPublicTimetable(tt, "2026-10-10T07:12:00Z");

  it("shows the next heat with its estimated time and ready call, and the released result with a share line", () => {
    const next = buildRiderPage("e4", res, site(), tabs, model)!;
    expect(next.nextLine).toBe("Your next heat: Pro Men · R1 · Heat 2 — est. 10:12 — be ready 09:57");
    expect(next.results).toEqual([]);
    const done = buildRiderPage("e1", res, site(), tabs, model)!;
    expect(done.nextLine).toBeNull();
    expect(done.results[0].row.place).toBe(1);
    expect(done.shareText).toBe("Ana Ladder: 1st · Pro Men · R1 · Heat 1 · 20.0");
    expect(done.ogDescription).toBe("1st · Pro Men · R1 · Heat 1 · 20.0");
  });

  it("a rider who is not on the public list has no page", () => {
    expect(buildRiderPage("nobody", res, site(), tabs, model)).toBeNull();
    expect(buildRiderPage("e1", null, site(), tabs, model)).toBeNull();
  });
});

describe("running totals on the live page", () => {
  const model = parseScoringModel(legacy);
  const live: PublicLiveHeat = {
    allowed: true,
    slots: [{ position: 1, entry_id: "e1", vest_colour: "red", modifier: null, flagged_out: false }, { position: 2, entry_id: "e2", vest_colour: "blue", modifier: null, flagged_out: false }],
    attempts: [
      { id: "a1", entry_id: "e1", seq: 1, direction: null, category_key: null, trick_name: "Backroll", status: "landed", height_m: null, possible_duplicate_of: null, created_at: "2026-10-10T07:01:00Z" },
      { id: "a2", entry_id: "e1", seq: 2, direction: null, category_key: null, trick_name: "Megaloop", status: "crashed", height_m: null, possible_duplicate_of: null, created_at: "2026-10-10T07:02:00Z" },
      { id: "a3", entry_id: "e2", seq: 1, direction: null, category_key: null, trick_name: "Frontroll", status: "landed", height_m: null, possible_duplicate_of: null, created_at: "2026-10-10T07:03:00Z" },
    ],
    scores: [1, 2, 3].flatMap((n) => [{ attempt_id: "a1", seat_no: n, criteria: null, score: 7, missed: false }, { attempt_id: "a3", seat_no: n, criteria: null, score: 5, missed: false }]),
    impressions: [],
    penalties: [],
  };
  const map = new Map(entries.map((e) => [e.id, e]));

  it("ranks the riders by what the panel has scored so far, with the same maths as the head judge's console", () => {
    const rows = liveRows(live, model, map, lycraScheme(), "Variety")!;
    expect(rows.map((r) => [r.entryId, r.place, r.totalLabel])).toEqual([["e1", 1, "7.0"], ["e2", 2, "5.0"]]);
    expect(rows[0].boxes.map((b) => [b.status, b.counted, b.scoreLabel])).toEqual([["landed", true, "7.0"], ["crashed", false, null]]);
    expect(rows[0].label?.primary.text).toBe("RED");
  });

  it("an attempt nobody has scored yet has no score and the rider has no total yet; a heat the division does not show live gives nothing", () => {
    const none = liveRows({ ...live, scores: [] }, model, map, lycraScheme(), "Variety")!;
    expect(none.every((r) => r.totalLabel === null)).toBe(true);
    expect(liveRows({ allowed: false }, model, map, lycraScheme(), "Variety")).toBeNull();
    expect(liveRows(live, null, map, lycraScheme(), null)).toBeNull();
  });
});

describe("sharing", () => {
  it("builds a WhatsApp link with the text and the page's address", () => {
    expect(whatsappLink("Test Cup: live scores", "https://x.test/e/test-cup")).toBe("https://wa.me/?text=Test%20Cup%3A%20live%20scores%20https%3A%2F%2Fx.test%2Fe%2Ftest-cup");
  });
});

describe("the trick in an attempt box (a division setting)", () => {
  const tricks: Array<[string, number | null, boolean]> = [["Left ×2 Backroll", 7, true], ["Right Frontroll", null, false], ["Kiteloop", 5, false]];
  const heats = [heatRow("h1", "R1-H1", 1, "published", ["e1"], { results: [breakdown(12, tricks)], publishedAt: "2026-10-10T07:00:00Z" })];
  const tabsFor = (attempt_display: string, opts?: { fullTricks?: boolean }) => buildHeatTabs(results(heats, { attempt_display }), site(), rules(), opts)[0];

  it("trick name + score: a landed, scored attempt carries its short trick; a crash never does", () => {
    const boxes = tabsFor("trick_score").riders[0].boxes;
    expect(boxes.map((b) => b.short)).toEqual(["L ×2 BR", "", "KL"]);
  });

  it("attempt number + score and scores only carry no trick at all, short or full", () => {
    for (const mode of ["number_score", "score_only", undefined as unknown as string]) {
      const boxes = tabsFor(mode).riders[0].boxes;
      expect(boxes.every((b) => b.short === "" && b.trick === "")).toBe(true);
    }
  });

  it("the full trick is carried only when the organiser's own files ask for it", () => {
    expect(tabsFor("number_score", { fullTricks: true }).riders[0].boxes.map((b) => b.trick)).toEqual(["Left ×2 Backroll", "Right Frontroll", "Kiteloop"]);
    expect(tabsFor("trick_score").riders[0].boxes.every((b) => b.trick === "")).toBe(true);
  });

  it("an attempt with no trick logged yet has no short trick", () => {
    const bare = [heatRow("h1", "R1-H1", 1, "published", ["e1"], { results: [breakdown(7, [["", 7, true]])], publishedAt: "2026-10-10T07:00:00Z" })];
    expect(buildHeatTabs(results(bare, { attempt_display: "trick_score" }), site(), rules())[0].riders[0].boxes[0].short).toBe("");
  });

  describe("on the live page", () => {
    const model = parseScoringModel(legacy);
    const map = new Map(entries.map((e) => [e.id, e]));
    const live: PublicLiveHeat = {
      allowed: true,
      slots: [{ position: 1, entry_id: "e1", vest_colour: "red", modifier: null, flagged_out: false }],
      attempts: [
        { id: "a1", entry_id: "e1", seq: 1, direction: "left", category_key: null, trick_name: "×2 Backroll", status: "landed", height_m: null, possible_duplicate_of: null, created_at: "2026-10-10T07:01:00Z" },
        { id: "a2", entry_id: "e1", seq: 2, direction: "right", category_key: null, trick_name: "Kiteloop", status: "crashed", height_m: null, possible_duplicate_of: null, created_at: "2026-10-10T07:02:00Z" },
        { id: "a3", entry_id: "e1", seq: 3, direction: "left", category_key: null, trick_name: "Frontroll", status: "landed", height_m: null, possible_duplicate_of: null, created_at: "2026-10-10T07:03:00Z" },
        { id: "a4", entry_id: "e1", seq: 4, direction: null, category_key: null, trick_name: null, status: "landed", height_m: null, possible_duplicate_of: null, created_at: "2026-10-10T07:04:00Z" },
      ],
      // attempts 1 and 4 are scored by the panel; attempt 3 is not scored yet
      scores: [1, 2, 3].flatMap((n) => [{ attempt_id: "a1", seat_no: n, criteria: null, score: 7, missed: false }, { attempt_id: "a4", seat_no: n, criteria: null, score: 6, missed: false }]),
      impressions: [],
      penalties: [],
    };
    const shorts = (mode: "number_score" | "trick_score" | "scores_only") => liveRows(live, model, map, lycraScheme(), "Variety", mode)![0].boxes.map((b) => b.short);

    it("trick name + score: the side from the spotter's L / R, only for a scored landed attempt", () => {
      expect(shorts("trick_score")).toEqual(["L ×2 BR", "", "", ""]);
    });
    it("a trick appears by itself once its score is in, and an attempt with no trick logged stays number and score", () => {
      const scored = { ...live, scores: [...live.scores!, ...[1, 2, 3].map((n) => ({ attempt_id: "a3", seat_no: n, criteria: null, score: 5, missed: false }))] };
      expect(liveRows(scored, model, map, lycraScheme(), "Variety", "trick_score")![0].boxes.map((b) => b.short)).toEqual(["L ×2 BR", "", "L FR", ""]);
    });
    it("a corrected trick updates the same way", () => {
      const fixed = { ...live, attempts: live.attempts!.map((a) => (a.id === "a1" ? { ...a, trick_name: "Backroll", direction: "right" } : a)) };
      expect(liveRows(fixed, model, map, lycraScheme(), "Variety", "trick_score")![0].boxes[0].short).toBe("R BR");
    });
    it("the other settings, and a call that names no setting, carry no trick", () => {
      expect(shorts("number_score")).toEqual(["", "", "", ""]);
      expect(shorts("scores_only")).toEqual(["", "", "", ""]);
      expect(liveRows(live, model, map, lycraScheme(), "Variety")![0].boxes.map((b) => b.short)).toEqual(["", "", "", ""]);
    });
    it("no box carries the full trick name", () => {
      expect(liveRows(live, model, map, lycraScheme(), "Variety", "trick_score")![0].boxes.every((b) => b.trick === "")).toBe(true);
    });
  });
});

describe("a block added to the trick base later reaches the boxes with no code change", () => {
  const preset = JSON.parse(readFileSync("presets/tricks/big-air-vocabulary.json", "utf8"));
  const trick_base = { vocabulary: { ...preset, baseTricks: [...preset.baseTricks, { key: "sushi_roll", label: "Sushi roll", category: "rotation", aliases: ["sushi"] }] }, local: [{ family: "addon", key: "zipper", label: "Zipperloop", category: null }] };
  const tricks: Array<[string, number | null, boolean]> = [["Left Sushi roll", 7, true], ["Right Zipperloop", 5, true], ["Rodeo", 4, false]];
  const heats = [heatRow("h1", "R1-H1", 1, "published", ["e1"], { results: [breakdown(16, tricks)], publishedAt: "2026-10-10T07:00:00Z" })];
  const boxes = (withBase: boolean) => buildHeatTabs(results(heats, { attempt_display: "trick_score" }), site(), withBase ? ({ ...rules(), trick_base } as never) : rules())[0].riders[0].boxes.map((b) => b.short);

  it("results: the event's trick base is read, names and local blocks included", () => {
    expect(boxes(true)).toEqual(["L SR", "R ZL", "RO"]);
  });
  it("an older database that sends no trick base falls back to the built-in Trick list and the first-letters rule (one unknown word: two letters)", () => {
    expect(boxes(false)).toEqual(["L SR", "R ZI", "RO"]);
  });
});
