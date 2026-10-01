import { describe, expect, it } from "vitest";
import { computeHeat, type RiderInput } from "@/lib/engine/scoring";
import { hetx, impressions, J3, landed, preset } from "@/lib/engine/scoring/fixtures";
import { tieSentences } from "./tie-words";

// docs/08 §1H-3, §1E
const model = preset("kota-best3-impression", (m) => {
  m.tieBreakers = ["highest_counted_trick", "next_counted_trick", "impression", "head_judge"];
});
function rider(riderId: string, tricks: number[], impression: number): RiderInput {
  return {
    riderId,
    attempts: tricks.map((v, i) => landed(i + 1, J3.map(() => hetx(v, v, v, v)))),
    impressionMarks: impressions([impression, impression, impression]),
  };
}
const names = (id: string) => id;
const words = (riders: RiderInput[], m = model, decisions: Array<{ riderIds: string[]; reason: string }> = []) =>
  tieSentences(m, computeHeat(m, { panelJudgeIds: J3, riders, headJudgeDecisions: decisions }), names, decisions).map((s) => s.text);

describe("1H-3 tie words", () => {
  it("higher best trick (8.6 vs 8.2)", () => {
    expect(words([rider("Blue", [8.2, 8.2, 7.6], 7.2), rider("Red", [8.6, 8.0, 7.2], 7.4)])).toEqual(["Red ahead of Blue: higher best trick (8.6 vs 8.2)"]);
  });
  it("higher next trick (8.0 vs 7.8)", () => {
    expect(words([rider("Blue", [8.6, 7.8, 7.6], 7.2), rider("Red", [8.6, 8.0, 7.2], 7.4)])).toEqual(["Red ahead of Blue: higher next trick (8.0 vs 7.8)"]);
  });
  it("Impression / Variety score, with the model's own label", () => {
    const m = preset("kota-best3-impression", (x) => {
      x.tieBreakers = ["impression", "head_judge"];
    });
    expect(words([rider("Blue", [8.2, 8.2, 7.6], 7.2), rider("Red", [8.6, 8.0, 7.2], 7.4)], m)).toEqual([
      `Red ahead of Blue: higher ${m.heat.impression!.label} (7.4 vs 7.2)`,
    ]);
  });
  it("more landed tricks (5 vs 4)", () => {
    const m = preset("kota-best3-impression", (x) => {
      x.tieBreakers = ["most_landed", "head_judge"];
    });
    const w = words([rider("Blue", [8.0, 8.0, 8.0, 0.0], 7.0), rider("Red", [8.0, 8.0, 8.0, 0.0, 0.0], 7.0)], m);
    expect(w).toEqual(["Red ahead of Blue: more landed tricks (5 vs 4)"]);
  });
  it("the head judge's decision with its reason", () => {
    const decisions = [{ riderIds: ["Red", "Blue"], reason: "paper sheet" }];
    expect(words([rider("Blue", [8.6, 8.0, 7.2], 7.4), rider("Red", [8.6, 8.0, 7.2], 7.4)], model, decisions)).toEqual(["Red ahead of Blue: head judge's decision — paper sheet"]);
  });
  it("unresolved: tied — choose the order", () => {
    expect(words([rider("Red", [8.6, 8.0, 7.2], 7.4), rider("Blue", [8.6, 8.0, 7.2], 7.4)])).toEqual(["Red and Blue are tied — choose the order"]);
  });
  it("shared place", () => {
    const m = preset("kota-best3-impression", (x) => {
      x.tieBreakers = ["highest_counted_trick", "share_place"];
    });
    expect(words([rider("Red", [8.6, 8.0, 7.2], 7.4), rider("Blue", [8.6, 8.0, 7.2], 7.4)], m)).toEqual(["Red and Blue share 1st place"]);
  });
  it("no tie, no sentence", () => {
    expect(words([rider("Red", [8.6, 8.0, 7.2], 7.4), rider("Blue", [5.0, 5.0, 5.0], 5.0)])).toEqual([]);
  });
});
