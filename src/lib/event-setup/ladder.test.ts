// RB1 — the Red Bull Winds of Sinai 2026 event description gives exactly the printed sheet: 22 heats, the same seats, the same placings.
// The expected sheet below is typed in separately from the description file, from the organisers' printed sheet (seeds in Round 1, places of earlier heats after).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { divisionPlacings } from "@/lib/engine/ladder";
import { checkLadder } from "@/lib/engine/ladder/custom-ladder-check";
import { ladderToDraw } from "@/lib/engine/ladder/custom-ladder-draw";
import { makeEntrants, publishAll, publishRound } from "@/lib/engine/ladder/fixtures";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import { parseEventDescription } from "./schema";
import { formatTemplateFor, ladderFromDescription, seatFromText } from "./ladder";

const FILE = "presets/events/red-bull-winds-of-sinai-2026.json";
const description = () => parseEventDescription(JSON.parse(readFileSync(FILE, "utf8")));

/** The printed sheet. Round 1 seats are seed numbers; later seats are "place heat" of an earlier heat. */
const SHEET: Array<[number, string[]]> = [
  [1, ["seed 5", "seed 12", "seed 16"]],
  [2, ["seed 3", "seed 9", "seed 15"]],
  [3, ["seed 2", "seed 7", "seed 13"]],
  [4, ["seed 6", "seed 11", "seed 18"]],
  [5, ["seed 4", "seed 8", "seed 14"]],
  [6, ["seed 1", "seed 10", "seed 17"]],
  [7, ["3rd H5", "2nd H4"]],
  [8, ["3rd H1", "2nd H2"]],
  [9, ["3rd H6", "2nd H5"]],
  [10, ["3rd H2", "2nd H6"]],
  [11, ["3rd H3", "2nd H1"]],
  [12, ["3rd H4", "2nd H3"]],
  [13, ["1st H1", "1st H10"]],
  [14, ["1st H6", "1st H12"]],
  [15, ["1st H3", "1st H7"]],
  [16, ["1st H4", "1st H9"]],
  [17, ["1st H5", "1st H8"]],
  [18, ["1st H2", "1st H11"]],
  [19, ["1st H14", "1st H17"]],
  [20, ["1st H15", "1st H13"]],
  [21, ["1st H18", "1st H16"]],
  [22, ["1st H19", "1st H20", "1st H21"]],
];
const ROUND_OF_HEAT = (n: number) => (n <= 6 ? "R1" : n <= 12 ? "R2" : n <= 18 ? "R3" : n <= 21 ? "R4" : "R5");

const entrants = () => makeEntrants(18);
const draw = () => ladderToDraw(formatTemplateFor(description()), entrants());

describe("RB1 the ladder of the event description", () => {
  it("has exactly 22 heats, numbered H1–H22 across the rounds, in the five rounds of the sheet", () => {
    const d = draw();
    expect(d.rounds.map((r) => r.id)).toEqual(["R1", "R2", "R3", "R4", "R5"]);
    expect(d.rounds.map((r) => r.heats.length)).toEqual([6, 6, 6, 3, 1]);
    expect(d.rounds.flatMap((r) => r.heats).map((h) => h.number)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
  });

  it("puts every seed and every place in the seat of the printed sheet (heat by heat)", () => {
    const d = draw();
    for (const [number, seats] of SHEET) {
      const h = d.rounds.flatMap((r) => r.heats).find((x) => x.number === number)!;
      expect(h.round, `H${number} is in its round`).toBe(ROUND_OF_HEAT(number));
      expect(h.slots.length, `H${number} seat count`).toBe(seats.length);
      const got = h.slots.map((s) => {
        if (s.seed !== undefined && !s.from) return `seed ${s.seed}`;
        const from = s.from!;
        // `from.heat` counts inside its round; the sheet counts across the rounds
        const base = { R1: 0, R2: 6, R3: 12, R4: 18, R5: 21 }[from.round]!;
        const ord = from.place === 1 ? "1st" : from.place === 2 ? "2nd" : "3rd";
        return `${ord} H${base + from.heat}`;
      });
      expect(got, `H${number}`).toEqual(seats);
    }
  });

  it("uses every seed once, and every place that goes on exactly once", () => {
    const seeds = draw().rounds[0].heats.flatMap((h) => h.slots.map((s) => s.seed)).sort((a, b) => a! - b!);
    expect(seeds).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });

  it("sends 1st to Round 3 and 2nd and 3rd to Round 2 from Round 1; winners on from the rest; nobody goes home in Round 1", () => {
    const d = draw();
    const r2 = d.rounds[1].heats.flatMap((h) => h.slots.map((s) => `${s.from!.round}:${s.from!.place}`));
    expect(new Set(r2)).toEqual(new Set(["R1:2", "R1:3"]));
    const r3 = d.rounds[2].heats.flatMap((h) => h.slots.map((s) => `${s.from!.round}:${s.from!.place}`));
    expect(r3.filter((x) => x === "R1:1")).toHaveLength(6);
    expect(r3.filter((x) => x === "R2:1")).toHaveLength(6);
    // publishing the whole of Round 1 knocks nobody out: no rider has a final place yet
    expect(divisionPlacings(publishRound(d, "R1"))).toEqual([]);
  });

  it("comes out 1–3, 4= (three), 7= (six), 13= (six): 18 riders, the first three places single", () => {
    const done = publishAll(draw());
    const labels = divisionPlacings(done).map((p) => p.label);
    const count = (l: string) => labels.filter((x) => x === l).length;
    expect(labels).toHaveLength(18);
    expect(["1", "2", "3"].map(count)).toEqual([1, 1, 1]);
    expect(count("4=")).toBe(3);
    expect(count("7=")).toBe(6);
    expect(count("13=")).toBe(6);
  });

  it("the ladder checker is green with the 18 riders (no red fault)", () => {
    const check = checkLadder(ladderFromDescription(description().ladder), entrants().map((e) => ({ id: e.id, name: e.name })));
    expect(check.faults).toEqual([]);
    expect(check.complete).toBe(true);
    expect(check.heats).toBe(22);
    expect(check.seats).toBe(18 + 12 + 12 + 6 + 3);
  });

  it("round timing: 10 min in Round 1, 8 in Rounds 2, 3 and the Semi-final, 12 in the Final; a 3-minute start sequence and no break before every heat", () => {
    const d = draw();
    const mins = d.rounds.map((r) => [...new Set(r.heats.map((h) => h.durationMin))]);
    expect(mins).toEqual([[10], [8], [8], [8], [12]]);
    for (const h of d.rounds.flatMap((r) => r.heats)) {
      expect(h.warmUpMin).toBe(3);
      expect(h.breakAfterHeatMin).toBe(0);
      expect(h.breakAfterRoundMin).toBe(0);
    }
  });

  it("the slots add up to 4 h 18 min: (10+3)×6 + (8+3)×15 + (12+3)", () => {
    const slots = draw().rounds.flatMap((r) => r.heats).map((h) => h.durationMin + (h.warmUpMin ?? 0));
    expect(slots.reduce((a, b) => a + b, 0)).toBe(258);
    expect(258).toBe(4 * 60 + 18);
  });

  it("is a valid custom-ladder format with no flag-out", () => {
    const t = formatTemplateFor(description());
    expect(parseFormatTemplate(t).kind).toBe("ladder");
    expect(JSON.stringify(t)).not.toMatch(/flagOut/);
  });
});

describe("RB1 seat text", () => {
  it("reads seeds and places", () => {
    expect(seatFromText("seed 12")).toEqual({ type: "seed", seed: 12 });
    expect(seatFromText("2nd H4")).toEqual({ type: "place", heat: 4, place: 2 });
  });
  it("refuses text it does not understand", () => {
    expect(() => seatFromText("winner of H4")).toThrow(/seat/i);
  });
  it("refuses a seat that waits for a heat of the same or a later round", () => {
    const d = description();
    const bad = structuredClone(d);
    bad.ladder.rounds[1].heats[0].seats[0] = "3rd H9";
    expect(() => ladderFromDescription(bad.ladder)).toThrow(/earlier/i);
  });
});
