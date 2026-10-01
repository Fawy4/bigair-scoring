import { describe, expect, it } from "vitest";
import { flagOutCandidates } from "@/lib/engine/scoring/flag-out";
import { hetx, impressions, landed, preset } from "@/lib/engine/scoring/fixtures";
import type { RiderInput } from "@/lib/engine/scoring";

// docs/08 §1H-2. Totals 18.20 / 15.00 / 12.40 with one judge: three equal single tricks plus a variety score.
const model = preset("legacy-kol-best3-variety", (m) => {
  m.heat.impression!.scale.step = 0.1; // the legacy 0.5 step is editable per event
});
const J = ["J1"];
function rider(riderId: string, trick: number, impression: number): RiderInput {
  return {
    riderId,
    attempts: [1, 2, 3].map((n) => landed(n, [trick], {}, J)),
    impressionMarks: impressions([impression], J),
  };
}
const heat = (riders: RiderInput[]) => ({ panelJudgeIds: J, riders });
void hetx;

describe("1H-2 flag-out candidates", () => {
  const riders = [rider("A", 5.0, 3.2), rider("B", 4.0, 3.0), rider("C", 3.0, 3.4)];
  it("flag-out 1 offers the last rider", () => {
    const r = flagOutCandidates(model, heat(riders), 1);
    expect(r.riders).toEqual(["C"]);
    expect(r.undecided).toBe(false);
  });
  it("flag-out 2 offers the last two, worst first", () => {
    expect(flagOutCandidates(model, heat(riders), 2).riders).toEqual(["C", "B"]);
  });
  it("two riders tied on everything at the cut: both are offered and the choice is undecided", () => {
    const tied = [rider("A", 5.0, 3.2), rider("B", 4.0, 3.0), rider("C", 4.0, 3.0)];
    const r = flagOutCandidates(model, heat(tied), 1);
    expect(r.undecided).toBe(true);
    expect([...r.riders].sort()).toEqual(["B", "C"]);
  });
  it("a count of zero flags nobody", () => {
    expect(flagOutCandidates(model, heat(riders), 0).riders).toEqual([]);
  });
});
