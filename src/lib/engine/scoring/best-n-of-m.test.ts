import { describe, expect, it } from "vitest";
import { checkCanAddAttempt, computeHeat, flagPossibleDuplicates, normaliseTrickName } from "./index";
import { crashed, impressions, J3, landed, preset, same } from "./fixtures";
import type { Attempt, RiderInput } from "./types";

// The owner's default: single mark per trick, best N of M attempts, no categories.
// Legacy preset = best 3 of 7 + Variety, decimals 1.
const model = preset("legacy-kol-best3-variety");
const one = (rider: RiderInput, m = model) => computeHeat(m, { panelJudgeIds: J3, riders: [rider] }).riders[0];
const rider = (attempts: Attempt[]): RiderInput => ({ riderId: "R", attempts, impressionMarks: impressions([5, 5, 5]) });

describe("best N of M — the owner's default path", () => {
  it("counts the best 3 landed tricks and ignores the rest", () => {
    const r = one(rider([landed(1, same(5)), landed(2, same(7)), landed(3, same(6)), landed(4, same(4)), landed(5, same(8))]));
    expect(r.counted.map((c) => c.attemptSeq)).toEqual([5, 2, 3]);
    expect(r.components.tricks).toBe(21);
    expect(r.total).toBe(26);
    expect(r.allAttempts.filter((a) => !a.counted).map((a) => [a.seq, a.ignored])).toEqual([
      [1, "not_selected"],
      [4, "not_selected"],
    ]);
  });

  it("equal scores: the earlier attempt counts first (stable by seq)", () => {
    const r = one(rider([landed(1, same(6)), landed(2, same(7)), landed(3, same(6)), landed(4, same(6))]));
    expect(r.counted.map((c) => c.attemptSeq)).toEqual([2, 1, 3]);
  });

  it("fewer landed than N → counts what exists", () => {
    const r = one(rider([landed(1, same(6)), crashed(2)]));
    expect(r.counted.map((c) => c.attemptSeq)).toEqual([1]);
    expect(r.total).toBe(11);
  });

  it("no attempts and no impression yet → total 0, impression still owed", () => {
    const res = computeHeat(model, { panelJudgeIds: J3, riders: [{ riderId: "R", attempts: [] }] });
    expect(res.riders[0].total).toBe(0);
    expect(res.publishBlockers).toHaveLength(3);
  });

  it("crashes count toward the 7-attempt cap", () => {
    const r = one(rider([crashed(1), crashed(2), landed(3, same(5))]));
    expect(r.attemptCount).toBe(3);
    expect(r.landedCount).toBe(1);
  });

  describe("attempt cap (maxAttemptsPerRider = 7) counts non-deleted attempts in order", () => {
    const eight = () => Array.from({ length: 8 }, (_, i) => landed(i + 1, same(i === 7 ? 9.5 : 5)));

    it("an 8th attempt is ignored and flagged, even if it is the best", () => {
      const r = one(rider(eight()));
      expect(r.allAttempts[7].ignored).toBe("over_cap");
      expect(r.allAttempts[7].counted).toBe(false);
      expect(r.flags.extraAttemptsIgnored).toBe(true);
      expect(r.components.tricks).toBe(15);
    });

    it("if attempt #3 was deleted, #8 is only the 7th and counts", () => {
      const attempts = eight();
      attempts[2].deleted = true;
      const r = one(rider(attempts));
      expect(r.flags.extraAttemptsIgnored).toBe(false);
      expect(r.attemptCount).toBe(7);
      expect(r.allAttempts.map((a) => a.seq)).toEqual([1, 2, 4, 5, 6, 7, 8]); // seq numbers unchanged
      expect(r.counted[0]).toEqual({ attemptSeq: 8, score: 9.5, categoryKey: null });
    });

    it("unlimited when the division sets null", () => {
      const m = preset("legacy-kol-best3-variety", (x) => {
        x.heat.maxAttemptsPerRider = null;
      });
      const r = one(rider(eight()), m);
      expect(r.flags.extraAttemptsIgnored).toBe(false);
      expect(r.counted[0].attemptSeq).toBe(8);
      expect(r.attemptCap).toBeNull();
    });

    it("server-side check rejects an 8th attempt with a readable message", () => {
      expect(checkCanAddAttempt(model, 6)).toEqual({ ok: true });
      const res = checkCanAddAttempt(model, 7);
      expect(res.ok).toBe(false);
      expect(!res.ok && res.message).toMatch(/7 of 7/);
    });
  });

  describe("repeatIndex (repeated trick badge)", () => {
    const attempts = () => [
      landed(1, same(6), { trickName: "Left Backroll" }),
      crashed(2, { trickName: "left backroll" }),
      landed(3, same(7), { trickName: "Right Frontroll" }),
      landed(4, same(5), { trickName: "  LEFT   Backroll " }),
      landed(5, same(4)),
    ];

    const info = (r: ReturnType<typeof one>) => r.allAttempts.map((a) => [a.seq, a.repeatIndex, a.priorCrashesSameTrick]);

    it("counts only earlier LANDED attempts with the same normalised name; crashes reported separately", () => {
      // #2 is a crash of a trick already landed at #1; #4 is the second landing (1 repeat, 1 prior crash).
      expect(info(one(rider(attempts())))).toEqual([
        [1, 0, 0],
        [2, 1, 0],
        [3, 0, 0],
        [4, 1, 1],
        [5, 0, 0],
      ]);
    });

    it("a crash followed by a landing of the same trick is not a repeat", () => {
      const r = one(rider([crashed(1, { trickName: "Left Backroll" }), landed(2, same(6), { trickName: "left backroll" })]));
      expect(info(r)).toEqual([
        [1, 0, 0],
        [2, 0, 1],
      ]);
    });

    it("deleted attempts count neither as repeats nor as prior crashes", () => {
      const a = attempts();
      a[0].deleted = true; // the first landed Left Backroll
      expect(info(one(rider(a)))).toEqual([
        [2, 0, 0],
        [3, 0, 0],
        [4, 0, 1],
        [5, 0, 0],
      ]);
      const b = attempts();
      b[1].deleted = true; // the crash
      expect(info(one(rider(b)))).toEqual([
        [1, 0, 0],
        [3, 0, 0],
        [4, 1, 0],
        [5, 0, 0],
      ]);
    });

    it("no automatic penalty: a repeat still counts when distinctTrickNames is off", () => {
      const r = one(rider(attempts()));
      expect(r.counted.map((c) => c.attemptSeq)).toEqual([3, 1, 4]);
    });

    it("normaliseTrickName is case- and whitespace-insensitive", () => {
      expect(normaliseTrickName("  LEFT   Backroll ")).toBe("left backroll");
      expect(normaliseTrickName(null)).toBeNull();
      expect(normaliseTrickName("   ")).toBeNull();
    });
  });

  describe("possible duplicates (doc 08 §1F)", () => {
    const base = (secondAt: string): Attempt[] => [
      landed(1, same(6), { createdAt: "2026-10-10T12:00:00Z", createdBy: "spotA" }),
      landed(2, same(7), { createdAt: secondAt, createdBy: "spotB" }),
    ];

    it("8 s apart from different seats → flagged", () => {
      const flagged = flagPossibleDuplicates(base("2026-10-10T12:00:08Z"), 20);
      expect(flagged[1].possibleDuplicateOf).toBe(1);
      expect(flagged[0].possibleDuplicateOf).toBeUndefined();
    });

    it("45 s apart → not flagged", () => {
      expect(flagPossibleDuplicates(base("2026-10-10T12:00:45Z"), 20)[1].possibleDuplicateOf).toBeUndefined();
    });

    it("same seat → not flagged", () => {
      const a = base("2026-10-10T12:00:08Z");
      a[1].createdBy = "spotA";
      expect(flagPossibleDuplicates(a, 20)[1].possibleDuplicateOf).toBeUndefined();
    });

    it("computeHeat uses heat.duplicateWindowSec; deleting the duplicate removes it from counting and the counter", () => {
      const r1 = one(rider(base("2026-10-10T12:00:08Z")));
      expect(r1.allAttempts[1].possibleDuplicateOf).toBe(1);
      const a = base("2026-10-10T12:00:08Z");
      a[1].deleted = true;
      const r2 = one(rider(a));
      expect(r2.attemptCount).toBe(1);
      expect(r2.counted.map((c) => c.attemptSeq)).toEqual([1]);
    });
  });
});
