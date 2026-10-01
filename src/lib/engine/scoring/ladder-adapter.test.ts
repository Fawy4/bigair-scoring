import { describe, expect, it } from "vitest";
import { computeHeat } from "./index";
import { toLadderResult } from "./ladder-adapter";
import { hetx, impressions, J3, landed, preset } from "./fixtures";
import type { RiderInput } from "./types";

// docs/08 §1H-8 — the scoring engine hands the ladder place, total, modifier and tie keys.
const model = preset("kota-best3-impression", (m) => {
  m.tieBreakers = ["highest_counted_trick", "next_counted_trick", "impression", "head_judge"];
});

function rider(riderId: string, tricks: number[], impression: number, extra: Partial<RiderInput> = {}): RiderInput {
  return {
    riderId,
    attempts: tricks.map((v, i) => landed(i + 1, J3.map(() => hetx(v, v, v, v)))),
    impressionMarks: impressions([impression, impression, impression]),
    ...extra,
  };
}
const run = (riders: RiderInput[]) => computeHeat(model, { panelJudgeIds: J3, riders });

describe("1H-8 toLadderResult", () => {
  it("Red and Blue both 31.20: Red place 1 with keys [8.6, 8.0, 7.2, 7.4], Blue place 2 with [8.2, 8.2, 7.6, 7.2]", () => {
    const res = run([rider("Blue", [8.2, 8.2, 7.6], 7.2), rider("Red", [8.6, 8.0, 7.2], 7.4)]);
    const out = toLadderResult(model, res);
    expect(out.ranked).toEqual([
      { entrantId: "Red", place: 1, total: 31.2, tieKeys: [8.6, 8.0, 7.2, 7.4] },
      { entrantId: "Blue", place: 2, total: 31.2, tieKeys: [8.2, 8.2, 7.6, 7.2] },
    ]);
  });

  it("a rider who did not start has modifier DNS and no total; a disqualified rider has DSQ and no total", () => {
    const res = run([
      rider("Red", [8.0, 7.0, 6.0], 7.0),
      rider("Blue", [], 0, { modifiers: [{ type: "DNS" }], impressionMarks: [] }),
      rider("Green", [5.0], 5.0, { modifiers: [{ type: "DSQ" }] }),
    ]);
    const out = toLadderResult(model, res);
    expect(out.ranked.map((r) => [r.entrantId, r.place, r.modifier ?? null, r.total])).toEqual([
      ["Red", 1, null, 28],
      ["Blue", 2, "DNS", null],
      ["Green", 3, "DSQ", null],
    ]);
  });

  it("an unresolved tie keeps the same place for both riders (publishing is blocked elsewhere)", () => {
    const res = run([rider("Red", [8.6, 8.0, 7.2], 7.4), rider("Blue", [8.6, 8.0, 7.2], 7.4)]);
    expect(toLadderResult(model, res).ranked.map((r) => r.place)).toEqual([1, 1]);
  });
});
