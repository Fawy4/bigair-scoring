import { describe, expect, it } from "vitest";
import { computeHeat } from "./index";
import { hetx, J3, landed, preset } from "./fixtures";

// Polish 2, item 1: the head judge marks a judge Absent for a rider's Impression / Variety score (as for a trick score).
// An Absent mark is "missed": it is not counted, it is not missing, and it does not block Publish.
const model = preset("kota-best3-impression");
const rider = (marks: Array<{ judgeId: string; value: number | "missed" }>) => ({
  riderId: "red",
  attempts: [landed(1, J3.map(() => hetx(8, 8, 8, 8)))],
  impressionMarks: marks,
});

describe("Impression / Variety score marked Absent", () => {
  it("7.5 and 8.0 with J3 Absent → panel 7.75 from two judges, nothing missing, Publish not blocked", () => {
    const r = computeHeat(model, { panelJudgeIds: J3, riders: [rider([{ judgeId: "J1", value: 7.5 }, { judgeId: "J2", value: 8.0 }, { judgeId: "J3", value: "missed" }])] });
    const imp = r.riders[0].impression!;
    expect(imp.score).toBe(7.75);
    expect(imp.missing).toEqual([]);
    expect(imp.missedBy).toEqual(["J3"]);
    expect(imp.incomplete).toBe(false);
    expect(r.publishBlockers).toEqual([]);
  });
  it("without J3's mark at all, J3 is missing and Publish is blocked (unchanged)", () => {
    const r = computeHeat(model, { panelJudgeIds: J3, riders: [rider([{ judgeId: "J1", value: 7.5 }, { judgeId: "J2", value: 8.0 }])] });
    expect(r.publishBlockers).toEqual([{ type: "impression_missing", judge: "J3", rider: "red" }]);
  });
  it("every judge Absent → no Impression score (0 points), nothing missing", () => {
    const r = computeHeat(model, { panelJudgeIds: J3, riders: [rider(J3.map((judgeId) => ({ judgeId, value: "missed" as const })))] });
    expect(r.riders[0].impression!.score).toBeNull();
    expect(r.riders[0].components.impression).toBe(0);
    expect(r.publishBlockers).toEqual([]);
  });
});
