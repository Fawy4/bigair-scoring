import { describe, expect, it } from "vitest";
import { canAddPastCap, defaultKeep, mergePlan } from "./merge-plan";

// docs/08 §1H-5 and §1H-6
const A = { id: "A", created_at: "2026-10-02T10:00:00Z", seq: 1 };
const B = { id: "B", created_at: "2026-10-02T10:00:05Z", seq: 2 };

describe("1H-5 merge plan", () => {
  const scores = [
    { attemptId: "A", judgeId: "J1", value: 7.5 },
    { attemptId: "B", judgeId: "J1", value: 7.0 },
    { attemptId: "B", judgeId: "J2", value: 8.0 },
    { attemptId: "B", judgeId: "J3", value: 6.5 },
  ];
  it("the first logged attempt is the one kept, whichever order they are ticked in", () => {
    expect(defaultKeep([B, A]).keep).toBe("A");
    expect(defaultKeep([A, B]).drop).toEqual(["B"]);
  });
  it("keeps A; J1 stays 7.5, J2 8.0 and J3 6.5 move to A", () => {
    const p = mergePlan("A", ["B"], scores, {});
    expect(p.final).toEqual({ J1: 7.5, J2: 8.0, J3: 6.5 });
    expect(p.moves.map((m) => [m.judgeId, m.from])).toEqual([["J2", "B"], ["J3", "B"]]);
    expect(p.conflicts.map((c) => c.judgeId)).toEqual(["J1"]);
    expect(p.conflicts[0]).toMatchObject({ keepValue: 7.5, dropValue: 7.0, takes: "keep" });
  });
  it("the head judge's choice 'J1: take B's' gives 7.0", () => {
    expect(mergePlan("A", ["B"], scores, { J1: "drop" }).final.J1).toBe(7.0);
  });
  it("a Missed answer is also an answer: it is kept like a score", () => {
    const p = mergePlan("A", ["B"], [{ attemptId: "A", judgeId: "J1", value: null }, { attemptId: "B", judgeId: "J2", value: null }], {});
    expect(p.final).toEqual({ J1: null, J2: null });
  });
});

describe("1H-6 who may add an attempt past the cap", () => {
  it("head judge yes with a reason", () => expect(canAddPastCap({ role: "head", hasActiveHead: true, reason: "kite tangle" })).toEqual({ ok: true }));
  it("organiser only when the event has no active head judge", () => {
    expect(canAddPastCap({ role: "organiser", hasActiveHead: false, reason: "x y z" })).toEqual({ ok: true });
    expect(canAddPastCap({ role: "organiser", hasActiveHead: true, reason: "x y z" })).toEqual({ ok: false, code: "NOT_ALLOWED" });
  });
  it("judge, spotter and announcer never", () => {
    for (const role of ["judge", "spotter", "announcer"] as const) expect(canAddPastCap({ role, hasActiveHead: false, reason: "x y z" })).toEqual({ ok: false, code: "NOT_ALLOWED" });
  });
  it("nobody without a reason", () => {
    expect(canAddPastCap({ role: "head", hasActiveHead: true, reason: "  " })).toEqual({ ok: false, code: "OVERRIDE_REASON_REQUIRED" });
  });
});
