import { describe, expect, it } from "vitest";
import clubJson from "../../../presets/scoring/club-quick-best2.json";
import kotaJson from "../../../presets/scoring/kota-best3-impression.json";
import legacyJson from "../../../presets/scoring/legacy-kol-best3-variety.json";
import pukl from "../../../presets/scoring/pukl-points.json";
import overall from "../../../presets/scoring/overall-impression.json";
import megaloop from "../../../presets/scoring/megaloop-single-best.json";
import { judgeTrickScore } from "@/lib/engine/scoring";
import { parseScoringModel, type ScoringModel } from "@/lib/schemas/scoring-model";
import { isAllowed } from "@/lib/live/score-pad";
import { planImpressionWrites, planScoreWrites, type JudgeSeat, type PlanAttempt, type ModeContext } from "./judges";

const model = (j: unknown): ScoringModel => parseScoringModel(structuredClone(j));
const KOTA = model(kotaJson);
const CLUB = model(clubJson);
const LEGACY = model(legacyJson);
const PUKL = model(pukl);
const OVERALL = model(overall);
const MEGALOOP = model(megaloop);

const judges: JudgeSeat[] = [
  { seatId: "s1", seatNo: 1 },
  { seatId: "s2", seatNo: 2 },
  { seatId: "s3", seatNo: 3 },
];
const attempts = (n: number, status: "landed" | "crashed" = "landed", age = 30): PlanAttempt[] =>
  Array.from({ length: n }, (_, i) => ({ id: `a${i + 1}`, entryId: i % 2 ? "rB" : "rA", ordinal: Math.floor(i / 2) + 1, status, ageSec: age }));
const calm: ModeContext = { mode: "none", specialSeatNo: 2, missShare: 0.3, offlineSec: 60, lateSec: 20, speed: 1, heatEnded: false, sinceStartSec: 100, heatDurationSec: 600 };
const run = (m: ScoringModel, over: Partial<Parameters<typeof planScoreWrites>[0]> = {}) =>
  planScoreWrites({ model: m, spread: "normal", judges, attempts: attempts(8), existing: new Set(), mode: calm, deadSeatIds: [], tieEntries: null, limit: 1000, ...over });

describe("virtual judges' scores", () => {
  it("every score is on the scale's step and inside its range, for every kind of model", () => {
    for (const m of [KOTA, CLUB, LEGACY, PUKL, MEGALOOP]) {
      const writes = run(m, { attempts: attempts(40) });
      expect(writes.length).toBeGreaterThan(0);
      for (const w of writes) {
        if (w.kind !== "score") continue;
        expect(w.score).toBeGreaterThanOrEqual(m.trick.scale.min);
        expect(w.score).toBeLessThanOrEqual(m.trick.scale.max);
        if (m.trick.entry === "single") expect(isAllowed(w.score, m.trick.scale).ok).toBe(true); // a criteria score is the model's own sum or mean of the criteria, as on the phone
        if (m.trick.entry === "criteria") {
          expect(w.criteria).not.toBeNull();
          for (const c of m.trick.criteria) expect(isAllowed(w.criteria![c.key], c.scale).ok).toBe(true);
          expect(judgeTrickScore(m, w.criteria!).score).toBeCloseTo(w.score, 9);
        } else expect(w.criteria).toBeNull();
      }
    }
  });
  it("a model that does not score single tricks gets no trick scores", () => {
    expect(run(OVERALL)).toEqual([]);
  });
  it("nobody scores a crash", () => {
    expect(run(KOTA, { attempts: attempts(6, "crashed") })).toEqual([]);
  });
  it("does not repeat a score that is already in", () => {
    const first = run(KOTA);
    const existing = new Set(first.filter((w) => w.kind === "score").map((w) => `${w.attemptId}|${w.seatId}`));
    expect(run(KOTA, { existing })).toEqual([]);
  });
  it("is the same every time it is asked (safe to retry)", () => {
    expect(run(KOTA)).toEqual(run(KOTA));
  });
  it("a judge waits a moment after the attempt is logged", () => {
    expect(run(KOTA, { attempts: attempts(4, "landed", 0) })).toEqual([]);
    expect(run(KOTA, { attempts: attempts(4, "landed", 30) }).length).toBe(12);
  });
  it("after the heat ends everything that is due is written at once", () => {
    expect(run(KOTA, { attempts: attempts(4, "landed", 0), mode: { ...calm, heatEnded: true } }).length).toBe(12);
  });
  it("the limit keeps one tick short", () => {
    expect(run(KOTA, { limit: 5 }).length).toBe(5);
  });
});

describe("judge spread: agree / normal / disagree", () => {
  const spreadOf = (spread: "agree" | "normal" | "disagree") => {
    const writes = run(KOTA, { spread, attempts: attempts(60) });
    const byAttempt = new Map<string, number[]>();
    for (const w of writes) if (w.kind === "score") byAttempt.set(w.attemptId, [...(byAttempt.get(w.attemptId) ?? []), w.score]);
    const ranges = [...byAttempt.values()].map((v) => Math.max(...v) - Math.min(...v));
    return ranges.reduce((a, b) => a + b, 0) / ranges.length;
  };
  it("agree: all three judges give the same score", () => expect(spreadOf("agree")).toBe(0));
  it("normal: a little apart", () => {
    expect(spreadOf("normal")).toBeGreaterThan(0.1);
    expect(spreadOf("normal")).toBeLessThan(1.2);
  });
  it("disagree: clearly further apart than normal", () => expect(spreadOf("disagree")).toBeGreaterThan(spreadOf("normal") * 1.8));
});

describe("judge modes", () => {
  it("one judge misses attempts: only that judge, about the chosen share, as Missed", () => {
    const writes = run(KOTA, { attempts: attempts(200), mode: { ...calm, mode: "misses", specialSeatNo: 2, missShare: 0.3 } });
    const missed = writes.filter((w) => w.kind === "missed");
    expect(missed.every((w) => w.seatId === "s2")).toBe(true);
    expect(missed.length).toBeGreaterThan(40);
    expect(missed.length).toBeLessThan(80);
    expect(writes.filter((w) => w.seatId !== "s2").every((w) => w.kind === "score")).toBe(true);
  });
  it("one judge offline: nothing from them during the minute, everything when they are back", () => {
    const base = { ...calm, mode: "offline" as const, specialSeatNo: 3, offlineSec: 60, heatDurationSec: 100, speed: 1 };
    // the window starts at 30 % of the heat (30 s) and lasts 60 s
    const during = run(KOTA, { attempts: attempts(6), mode: { ...base, sinceStartSec: 50 } });
    expect(during.some((w) => w.seatId === "s3")).toBe(false);
    expect(during.some((w) => w.seatId === "s1")).toBe(true);
    const after = run(KOTA, { attempts: attempts(6), mode: { ...base, sinceStartSec: 100 } });
    expect(after.filter((w) => w.seatId === "s3").length).toBe(6);
  });
  it("the offline minute is shorter on a faster clock", () => {
    const base = { ...calm, mode: "offline" as const, specialSeatNo: 3, offlineSec: 60, heatDurationSec: 60, speed: 10 };
    // 30 % of 60 s = 18 s, and a minute at ×10 is 6 s: the judge is back at 24 s
    expect(run(KOTA, { attempts: attempts(4), mode: { ...base, sinceStartSec: 20 } }).some((w) => w.seatId === "s3")).toBe(false);
    expect(run(KOTA, { attempts: attempts(4), mode: { ...base, sinceStartSec: 25 } }).some((w) => w.seatId === "s3")).toBe(true);
  });
  it("one judge late: their scores wait longer than the others'", () => {
    const base = { ...calm, mode: "late" as const, specialSeatNo: 1, lateSec: 20, speed: 1 };
    const young = run(KOTA, { attempts: attempts(4, "landed", 10), mode: base });
    expect(young.some((w) => w.seatId === "s1")).toBe(false);
    expect(young.some((w) => w.seatId === "s2")).toBe(true);
    expect(run(KOTA, { attempts: attempts(4, "landed", 40), mode: base }).some((w) => w.seatId === "s1")).toBe(true);
  });
  it("lateness is shorter on a faster clock", () => {
    const base = { ...calm, mode: "late" as const, specialSeatNo: 1, lateSec: 20, speed: 20 };
    expect(run(KOTA, { attempts: attempts(4, "landed", 3), mode: base }).some((w) => w.seatId === "s1")).toBe(true);
  });
  it("a judge whose phone died writes nothing", () => {
    const writes = run(KOTA, { deadSeatIds: ["s2"] });
    expect(writes.some((w) => w.seatId === "s2")).toBe(false);
    expect(writes.some((w) => w.seatId === "s1")).toBe(true);
  });
  it("only the chosen position gets the special mode", () => {
    const writes = run(KOTA, { attempts: attempts(100), mode: { ...calm, mode: "misses", specialSeatNo: 1 } });
    expect(writes.filter((w) => w.kind === "missed").every((w) => w.seatId === "s1")).toBe(true);
  });
});

describe("a forced tie", () => {
  it("two riders get the same scores from every judge, attempt for attempt", () => {
    const writes = run(KOTA, { spread: "disagree", attempts: attempts(8), tieEntries: ["rA", "rB"] });
    for (const j of judges) {
      const a = writes.filter((w) => w.seatId === j.seatId && w.attemptId.startsWith("a") && ["a1", "a3", "a5", "a7"].includes(w.attemptId)).map((w) => (w.kind === "score" ? w.score : -1));
      const b = writes.filter((w) => w.seatId === j.seatId && ["a2", "a4", "a6", "a8"].includes(w.attemptId)).map((w) => (w.kind === "score" ? w.score : -1));
      expect(a).toEqual(b);
      expect(a.length).toBe(4);
    }
  });
  it("nobody misses an attempt of a tied rider (a missed mark would break the tie)", () => {
    const writes = run(KOTA, { attempts: attempts(8), tieEntries: ["rA", "rB"], mode: { ...calm, mode: "misses", missShare: 0.9, specialSeatNo: 1 } });
    expect(writes.some((w) => w.kind === "missed")).toBe(false);
  });
});

describe("Impression / Variety scores at the end of the heat", () => {
  const riders = [{ entryId: "rA" }, { entryId: "rB" }, { entryId: "rC" }];
  const plan = (m: ScoringModel, over: Partial<Parameters<typeof planImpressionWrites>[0]> = {}) =>
    planImpressionWrites({ model: m, spread: "normal", judges, riders, existing: new Set(), deadSeatIds: [], tieEntries: null, ...over });
  it("one for every rider from every judge, on the scale", () => {
    const w = plan(KOTA);
    expect(w.length).toBe(9);
    for (const x of w) expect(isAllowed(x.value, KOTA.heat.impression!.scale).ok).toBe(true);
  });
  it("legacy variety uses its own (0.5) steps", () => {
    for (const x of plan(LEGACY)) expect(isAllowed(x.value, LEGACY.heat.impression!.scale).ok).toBe(true);
  });
  it("nothing when the model has no impression", () => expect(plan(CLUB)).toEqual([]));
  it("skips what is already in, and the judge whose phone died", () => {
    const w = plan(KOTA, { existing: new Set(["rA|s1"]), deadSeatIds: ["s3"] });
    expect(w.length).toBe(5);
  });
  it("tied riders get the same Impression score from each judge", () => {
    const w = plan(KOTA, { spread: "disagree", tieEntries: ["rA", "rB"] });
    for (const j of judges) {
      expect(w.find((x) => x.seatId === j.seatId && x.entryId === "rA")!.value).toBe(w.find((x) => x.seatId === j.seatId && x.entryId === "rB")!.value);
    }
  });
  it("is the same every time", () => expect(plan(KOTA)).toEqual(plan(KOTA)));
});

// Polish 2, item 7: "Skip to end of heat" — the virtual judges finish what is left at once, the late and the offline judge too (a Missed stays a Missed).
describe("skip to the end of the heat", () => {
  it("a late judge and fresh attempts: everything is written now", () => {
    const late = { ...calm, mode: "late" as const, specialSeatNo: 2, lateSec: 60, heatEnded: true, finishNow: true };
    const writes = run(KOTA, { attempts: attempts(4, "landed", 0), mode: late });
    expect(writes.length).toBe(12);
    const waiting = run(KOTA, { attempts: attempts(4, "landed", 0), mode: { ...late, finishNow: false } });
    expect(waiting.filter((w) => w.seatId === "s2")).toHaveLength(0); // without the skip the late judge still waits
  });
  it("an offline judge whose phone is still off sends everything now", () => {
    const off = { ...calm, mode: "offline" as const, specialSeatNo: 3, offlineSec: 60, heatDurationSec: 100, sinceStartSec: 50, finishNow: true };
    expect(run(KOTA, { attempts: attempts(6), mode: off }).filter((w) => w.seatId === "s3")).toHaveLength(6);
  });
});
