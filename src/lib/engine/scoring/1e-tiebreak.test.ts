import { describe, expect, it } from "vitest";
import { computeHeat } from "./index";
import { hetx, impressions, J3, landed, preset } from "./fixtures";
import type { HeatInput, RiderInput } from "./types";

// doc 08 §1E — tie-breaks. Criteria all equal → judge trick score = that value.
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

function run(riders: RiderInput[], extra: Partial<HeatInput> = {}) {
  return computeHeat(model, { panelJudgeIds: J3, riders, ...extra });
}

describe("1E — tie-break", () => {
  it("equal totals 31.20: Red ranks above Blue on highest counted trick (8.6 > 8.2)", () => {
    const res = run([rider("Blue", [8.2, 8.2, 7.6], 7.2), rider("Red", [8.6, 8.0, 7.2], 7.4)]);
    expect(res.riders.map((r) => r.total)).toEqual([31.2, 31.2]);
    expect(res.ranking.map((r) => [r.riderId, r.place])).toEqual([["Red", 1], ["Blue", 2]]);
    expect(res.ranking[0].tieResolvedBy).toBe("highest_counted_trick");
  });

  it("same best trick → next counted trick decides (8.0 > 7.8)", () => {
    const res = run([rider("Blue", [8.6, 7.8, 7.6], 7.2), rider("Red", [8.6, 8.0, 7.2], 7.4)]);
    expect(res.ranking.map((r) => r.riderId)).toEqual(["Red", "Blue"]);
    expect(res.ranking[0].tieResolvedBy).toBe("next_counted_trick");
  });

  it("identical counted lists and impression → tieUnresolved and a publish blocker", () => {
    const res = run([rider("Red", [8.6, 8.0, 7.2], 7.4), rider("Blue", [8.6, 8.0, 7.2], 7.4)]);
    expect(res.ranking.every((r) => r.tieUnresolved)).toBe(true);
    expect(res.publishBlockers).toContainEqual({ type: "tie_unresolved", riders: ["Red", "Blue"] });
  });

  it("…resolved once the head judge decides", () => {
    const res = run([rider("Red", [8.6, 8.0, 7.2], 7.4), rider("Blue", [8.6, 8.0, 7.2], 7.4)], {
      headJudgeDecisions: [{ riderIds: ["Blue", "Red"], reason: "Blue landed cleaner" }],
    });
    expect(res.ranking.map((r) => [r.riderId, r.place])).toEqual([["Blue", 1], ["Red", 2]]);
    expect(res.ranking[0].tieResolvedBy).toBe("head_judge");
    expect(res.publishBlockers).toEqual([]);
  });

  it("next_counted_trick falls through to the next-best uncounted landed trick (decision 3)", () => {
    const mega = preset("megaloop-single-best", (m) => {
      m.tieBreakers = ["next_counted_trick", "head_judge"];
    });
    const e = (v: number) => ({ extremity: v, trick: v, style: v, landing: v });
    const riders: RiderInput[] = [
      { riderId: "A", attempts: [landed(1, J3.map(() => e(8.0))), landed(2, J3.map(() => e(6.0)))] },
      { riderId: "B", attempts: [landed(1, J3.map(() => e(8.0))), landed(2, J3.map(() => e(7.0)))] },
    ];
    const res = computeHeat(mega, { panelJudgeIds: J3, riders });
    expect(res.ranking.map((r) => r.riderId)).toEqual(["B", "A"]);
    expect(res.ranking[0].tieResolvedBy).toBe("next_counted_trick");
  });

  it("share_place gives equal placing", () => {
    const club = preset("club-quick-best2"); // [highest_counted_trick, most_landed, share_place]
    const riders: RiderInput[] = [
      { riderId: "A", attempts: [landed(1, [8, 8, 8]), landed(2, [7, 7, 7])] },
      { riderId: "B", attempts: [landed(1, [8, 8, 8]), landed(2, [7, 7, 7])] },
      { riderId: "C", attempts: [landed(1, [5, 5, 5])] },
    ];
    const res = computeHeat(club, { panelJudgeIds: J3, riders });
    expect(res.ranking.map((r) => [r.riderId, r.place, r.sharedPlace ?? false])).toEqual([
      ["A", 1, true],
      ["B", 1, true],
      ["C", 3, false],
    ]);
    expect(res.publishBlockers).toEqual([]);
  });
});

describe("DNS / DSQ placing (doc 08 §1F)", () => {
  it("DNS in a 3-rider heat ranks 3rd with total shown —", () => {
    const res = run([
      { ...rider("Red", [8, 8, 8], 7), modifiers: [{ type: "DNS" }] },
      rider("Blue", [7, 7, 7], 7),
      rider("Green", [6, 6, 6], 6),
    ]);
    const red = res.ranking.find((r) => r.riderId === "Red")!;
    expect(red.place).toBe(3);
    expect(red.totalLabel).toBe("—");
    expect(red.total).toBe(0);
  });

  it("DNS + DSQ in the same heat → DSQ last", () => {
    const res = run([
      { ...rider("Red", [8, 8, 8], 7), modifiers: [{ type: "DSQ" }] },
      { ...rider("Blue", [7, 7, 7], 7), modifiers: [{ type: "DNS" }] },
      rider("Green", [6, 6, 6], 6),
    ]);
    expect(res.ranking.map((r) => [r.riderId, r.place])).toEqual([["Green", 1], ["Blue", 2], ["Red", 3]]);
  });

  it("two DNS riders share last place", () => {
    const res = run([
      rider("Green", [6, 6, 6], 6),
      { riderId: "Red", attempts: [], modifiers: [{ type: "DNS" }] },
      { riderId: "Blue", attempts: [], modifiers: [{ type: "DNS" }] },
    ]);
    expect(res.ranking.map((r) => [r.riderId, r.place])).toEqual([["Green", 1], ["Red", 2], ["Blue", 2]]);
    expect(res.publishBlockers).toEqual([]);
  });
});
