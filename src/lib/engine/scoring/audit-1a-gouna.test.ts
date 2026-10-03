// Audit 1a (Gouna configuration) — scoring. See docs/AUDIT.md for the findings (A1a-n) these tests point at.
// The configuration: the KOTA-style preset (4 criteria 0–10 step 0.1, best 3 tricks + Impression), up to 7 attempts per rider,
// heats of 3 riders, 3 judges + a head judge who also scores (4 scores per attempt: trimming starts at 5, so a plain mean).
// Every random heat is scored twice: by computeHeat and by the brute-force scorer below, written from the rules alone
// (integer arithmetic in hundredths, no engine import), and the two must agree on every number, place and publish blocker.
import { describe, expect, it } from "vitest";
import { computeHeat, explain, judgeTrickScore, ScoringInputError } from "./index";
import { preset } from "./fixtures";
import type { Attempt, HeatInput, HeatResult, ImpressionMark, JudgeMark, ModifierType, RiderInput, TieDecision } from "./types";

const GOUNA = preset("kota-best3-impression", (m) => {
  m.heat.maxAttemptsPerRider = 7;
});
const PANEL4 = ["J1", "J2", "J3", "HJ"];
const PANEL3 = ["J1", "J2", "J3"];
const CRITERIA = ["height", "extremity", "technicality", "execution"] as const;

// ── a small seeded random generator, so every failure can be replayed from its seed ─────────────────────────────────
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), chance: (p: number) => next() < p };
}
type Rng = ReturnType<typeof rng>;

/** A value on the 0.1 step, in tenths (0..100); the scale limits 0 and 10 come up often on purpose. */
const tenths = (r: Rng) => (r.chance(0.1) ? 0 : r.chance(0.1) ? 100 : r.int(0, 100));

function randomHeat(seed: number): { input: HeatInput; seed: number } {
  const r = rng(seed);
  const panel = r.chance(0.5) ? PANEL4 : PANEL3;
  const absentJudge = r.chance(0.2) ? panel[r.int(0, panel.length - 1)] : null; // never enters anything at all
  const noImpressionJudge = r.chance(0.2) ? panel[r.int(0, panel.length - 1)] : null; // scores tricks, never an Impression
  const riders: RiderInput[] = ["red", "yellow", "blue"].map((id) => {
    const n = r.int(0, 9);
    const attempts: Attempt[] = [];
    for (let seq = 1; seq <= n; seq++) {
      const crashed = r.chance(0.25);
      const marks: JudgeMark[] = [];
      for (const j of [...panel, ...(r.chance(0.05) ? ["OFF"] : [])]) {
        if (j === absentJudge) continue;
        if (r.chance(0.1)) continue; // not entered yet
        if (r.chance(0.07)) {
          marks.push({ judgeId: j, value: "missed" });
          continue;
        }
        const v: Record<string, number> = {};
        for (const c of CRITERIA) v[c] = tenths(r) / 10;
        marks.push({ judgeId: j, value: v });
      }
      attempts.push({ seq, status: crashed ? "crashed" : "landed", trickName: r.chance(0.5) ? `T${r.int(1, 4)}` : null, deleted: r.chance(0.04), marks });
    }
    const impressionMarks: ImpressionMark[] = [];
    for (const j of panel) {
      if (j === absentJudge || j === noImpressionJudge) continue;
      if (r.chance(0.1)) continue;
      impressionMarks.push({ judgeId: j, value: r.chance(0.05) ? "missed" : tenths(r) / 10 });
    }
    const modifiers: { type: ModifierType }[] = [];
    if (r.chance(0.05)) modifiers.push({ type: "DNS" });
    else if (r.chance(0.05)) modifiers.push({ type: "DNF" });
    else if (r.chance(0.03)) modifiers.push({ type: "DSQ" });
    if (r.chance(0.1)) modifiers.push({ type: "INT" });
    if (r.chance(0.03)) modifiers.push({ type: "INT" });
    return { riderId: id, attempts, impressionMarks, ...(modifiers.length ? { modifiers } : {}) };
  });
  return { input: { panelJudgeIds: panel, riders }, seed };
}

// ── the brute-force scorer: the Gouna rules written out again, in whole hundredths ─────────────────────────────────
/** Round half up of the fraction p / q (q > 0, p ≥ 0) to a whole number. */
const roundFrac = (p: number, q: number) => Math.floor((2 * p + q) / (2 * q));

interface RefRider {
  id: string;
  status: "ok" | "DNS" | "DNF" | "DSQ";
  total: number; // hundredths
  tricks: number;
  impression: number;
  penalty: number;
  counted: Array<{ seq: number; score: number }>; // best first, after interference
  uncounted: number[]; // landed, scored, inside the cap, not counted, not dropped — best first
  landed: number;
  missing: Array<{ judge: string; seq: number }>;
  impressionMissing: string[];
}

function refRider(rider: RiderInput, panel: string[]): RefRider {
  const types = new Set((rider.modifiers ?? []).map((m) => m.type));
  const status = types.has("DSQ") ? "DSQ" : types.has("DNS") ? "DNS" : types.has("DNF") ? "DNF" : "ok";
  const keeps = status === "ok" || status === "DNF";
  const live = rider.attempts.filter((a) => !a.deleted).sort((a, b) => a.seq - b.seq).slice(0, 7);
  const eligible: Array<{ seq: number; score: number }> = [];
  const missing: Array<{ judge: string; seq: number }> = [];
  let landed = 0;
  for (const a of live) {
    if (a.status !== "landed") continue;
    landed++;
    let sum = 0; // Σ criteria in tenths over the judges who scored
    let k = 0;
    for (const j of panel) {
      const m = a.marks.find((x) => x.judgeId === j);
      if (!m) {
        missing.push({ judge: j, seq: a.seq });
        continue;
      }
      if (m.value === "missed") continue;
      const v = m.value as Record<string, number>;
      sum += CRITERIA.reduce((s, c) => s + Math.round(v[c] * 10), 0);
      k++;
    }
    // judge score = Σ4 criteria / 4 (in points = tenths / 10) → panel mean = sum / (40 k) points = sum * 100 / (40 k) hundredths
    if (k > 0) eligible.push({ seq: a.seq, score: roundFrac(sum * 100, 40 * k) });
  }
  const pick = (pool: typeof eligible) => [...pool].sort((x, y) => y.score - x.score || x.seq - y.seq).slice(0, 3);
  let counted = keeps ? pick(eligible) : [];
  const tricks = counted.reduce((s, c) => s + c.score, 0);
  let dropped: number | null = null;
  if (keeps && types.has("INT") && counted.length > 0) {
    dropped = counted[0].seq; // one interference only (allowMultiple = false): the best trick goes
    counted = pick(eligible.filter((e) => e.seq !== dropped));
  }
  const after = counted.reduce((s, c) => s + c.score, 0);
  let impSum = 0;
  let impK = 0;
  const impressionMissing: string[] = [];
  for (const j of panel) {
    const m = (rider.impressionMarks ?? []).find((x) => x.judgeId === j);
    if (!m) impressionMissing.push(j);
    else if (m.value !== "missed") {
      impSum += Math.round(m.value * 10);
      impK++;
    }
  }
  const impression = keeps && impK > 0 ? roundFrac(impSum * 10, impK) : 0;
  const penalty = keeps ? tricks - after : 0;
  const countedSeqs = new Set(counted.map((c) => c.seq));
  const uncounted = eligible.filter((e) => !countedSeqs.has(e.seq) && e.seq !== dropped).map((e) => e.score).sort((x, y) => y - x);
  return {
    id: rider.riderId,
    status,
    total: keeps ? Math.max(0, tricks + impression - penalty) : 0,
    tricks: keeps ? tricks : 0,
    impression,
    penalty,
    counted,
    uncounted,
    landed,
    missing: status === "DNS" || status === "DSQ" ? [] : missing,
    impressionMissing: status === "DNS" || status === "DSQ" ? [] : impressionMissing,
  };
}

/** Tie-breakers of the preset: highest counted, next counted (then uncounted landed), Impression, most landed, head judge. */
function refCompare(a: RefRider, b: RefRider, decisions: TieDecision[]): number {
  const hi = (x: RefRider) => x.counted[0]?.score ?? -Infinity;
  if (hi(a) !== hi(b)) return hi(b) - hi(a);
  const rest = (x: RefRider) => [...x.counted.slice(1).map((c) => c.score), ...x.uncounted];
  const ra = rest(a);
  const rb = rest(b);
  for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
    const x = ra[i] ?? -Infinity;
    const y = rb[i] ?? -Infinity;
    if (x !== y) return y - x;
  }
  if (a.impression !== b.impression) return b.impression - a.impression;
  if (a.landed !== b.landed) return b.landed - a.landed;
  const d = decisions.find((x) => x.riderIds.includes(a.id) && x.riderIds.includes(b.id));
  return d ? d.riderIds.indexOf(a.id) - d.riderIds.indexOf(b.id) : 0;
}

function refHeat(input: HeatInput) {
  const riders = input.riders.map((r) => refRider(r, input.panelJudgeIds));
  const decisions = input.headJudgeDecisions ?? [];
  const active = riders.filter((r) => r.status === "ok" || r.status === "DNF").sort((a, b) => b.total - a.total || refCompare(a, b, decisions));
  const places = new Map<string, number>();
  const unresolved = new Set<string>();
  active.forEach((r, i) => {
    const prev = active[i - 1];
    if (prev && prev.total === r.total && refCompare(prev, r, decisions) === 0) {
      places.set(r.id, places.get(prev.id)!);
      unresolved.add(r.id).add(prev.id);
    } else places.set(r.id, i + 1);
  });
  const dns = riders.filter((r) => r.status === "DNS");
  for (const r of dns) places.set(r.id, active.length + 1);
  for (const r of riders.filter((x) => x.status === "DSQ")) places.set(r.id, active.length + dns.length + 1);
  const blockers = riders.flatMap((r) => [
    ...r.missing.map((m) => `score ${m.judge} ${r.id} #${m.seq}`),
    ...r.impressionMissing.map((j) => `impression ${j} ${r.id}`),
  ]);
  return { riders, places, unresolved, blockers };
}

const hundredths = (x: number) => Math.round(x * 100);
const engineBlockers = (res: HeatResult) =>
  res.publishBlockers.flatMap((b) => (b.type === "score_missing" ? [`score ${b.judge} ${b.rider} #${b.attemptSeq}`] : b.type === "impression_missing" ? [`impression ${b.judge} ${b.rider}`] : []));

// ── 1. random heats against the brute-force scorer ──────────────────────────────────────────────────────────────
describe("Audit 1a · scoring · 3000 random Gouna heats agree with an independent brute-force scorer", () => {
  const SEEDS = Array.from({ length: 3000 }, (_, i) => 1000 + i);

  it("totals, components, counted tricks, places, tie flags and publish blockers are identical", () => {
    let a1a1 = 0;
    for (const seed of SEEDS) {
      const { input } = randomHeat(seed);
      const res = computeHeat(GOUNA, input);
      const ref = refHeat(input);
      // A1a-1 (fixed in 0.11.1): riders tied on total with NO counted trick are a genuine tie. The generator still reaches that case
      // (counted below) and the brute-force scorer, which shares nothing with rank.ts, must agree on it like on every other seed.
      const noTrickTie = ref.riders.some((a) => ref.riders.some((b) => a !== b && a.counted.length === 0 && b.counted.length === 0 && a.status !== "DNS" && a.status !== "DSQ" && b.status !== "DNS" && b.status !== "DSQ" && a.total === b.total));
      if (noTrickTie) a1a1++;
      for (const rr of ref.riders) {
        const er = res.riders.find((x) => x.riderId === rr.id)!;
        const ctx = `seed ${seed}, rider ${rr.id}`;
        expect(er.status, ctx).toBe(rr.status);
        expect(hundredths(er.total), ctx).toBe(rr.total);
        expect(hundredths(er.components.tricks), ctx).toBe(rr.tricks);
        expect(hundredths(er.components.impression), ctx).toBe(rr.impression);
        expect(hundredths(er.components.penalty), ctx).toBe(rr.penalty);
        expect(er.counted.map((c) => [c.attemptSeq, hundredths(c.score)]), ctx).toEqual(rr.counted.map((c) => [c.seq, c.score]));
        expect(er.landedCount, ctx).toBe(rr.landed);
        const ranked = res.ranking.find((x) => x.riderId === rr.id)!;
        expect(ranked.place, ctx).toBe(ref.places.get(rr.id));
        expect(Boolean(ranked.tieUnresolved), ctx).toBe(ref.unresolved.has(rr.id));
      }
      expect(engineBlockers(res).sort(), `seed ${seed}: publish blockers`).toEqual([...ref.blockers].sort());
      const tieBlock = res.publishBlockers.some((b) => b.type === "tie_unresolved");
      expect(tieBlock, `seed ${seed}: a tie blocks publishing exactly when one is unresolved`).toBe(ref.unresolved.size > 0);
    }
    expect(a1a1, "the generator reaches the A1a-1 case (riders tied with no counted trick)").toBeGreaterThan(0);
    expect(a1a1, "…and it stays a small minority of the 3000 heats").toBeLessThan(300);
  });

  it("A1a-1: two riders on the same total with no counted trick are tied (not 'resolved by highest counted trick' in slot order)", () => {
    // Both crashed everything and got the same Impression (5.30). −∞ − (−∞) is NaN in rank.ts higherFirst, and NaN ≠ 0 counts as "decided".
    const crash = (seq: number): Attempt => ({ seq, status: "crashed", marks: [] });
    const res = computeHeat(GOUNA, heatOf([
      { riderId: "yellow", attempts: [crash(1)], impressionMarks: imp(5.3) },
      { riderId: "blue", attempts: [crash(1), crash(2)], impressionMarks: imp(5.3) },
    ]));
    expect(res.ranking.map((r) => [r.riderId, r.place, r.tieResolvedBy])).toEqual([["yellow", 1, undefined], ["blue", 1, undefined]]);
    expect(res.publishBlockers).toContainEqual({ type: "tie_unresolved", riders: ["yellow", "blue"] });
  });

  it("invariants: totals never negative, at most 3 counted, a crash never counts, nothing past attempt 7 counts", () => {
    for (const seed of SEEDS) {
      const { input } = randomHeat(seed);
      const res = computeHeat(GOUNA, input);
      for (const r of res.riders) {
        const ctx = `seed ${seed}, rider ${r.riderId}`;
        expect(r.total, ctx).toBeGreaterThanOrEqual(0);
        expect(r.counted.length, ctx).toBeLessThanOrEqual(3);
        const bySeq = new Map(r.allAttempts.map((a) => [a.seq, a]));
        for (const c of r.counted) {
          expect(bySeq.get(c.attemptSeq)?.status, `${ctx}: counted #${c.attemptSeq}`).toBe("landed");
          expect(bySeq.get(c.attemptSeq)?.ignored, ctx).toBeUndefined();
        }
        const order = r.allAttempts.map((a) => a.seq);
        for (const a of r.allAttempts.filter((x) => x.status === "crashed")) expect(a.counted, ctx).toBe(false);
        for (const a of r.allAttempts.filter((_, i) => i >= 7)) {
          expect(a.ignored, `${ctx}: attempt ${order.indexOf(a.seq) + 1} is past the cap`).toBe("over_cap");
          expect(a.counted, ctx).toBe(false);
        }
        expect(r.percent === null || Math.abs(r.percent - (r.total / 40) * 100) < 0.006, ctx).toBe(true);
      }
    }
  });

  it("the explanation text matches the numbers (counted sum, Impression, total)", () => {
    for (const seed of SEEDS) {
      const { input } = randomHeat(seed);
      const res = computeHeat(GOUNA, input);
      for (const r of res.riders) {
        const lines = explain(r, GOUNA);
        const ctx = `seed ${seed}, rider ${r.riderId}: ${lines.join(" | ")}`;
        if (r.status === "DNS" || r.status === "DSQ") {
          expect(lines, ctx).toHaveLength(1);
          continue;
        }
        const countedLine = lines.find((l) => l.startsWith("Counted tricks"))!;
        const m = countedLine.match(/: (.*) = (\d+\.\d\d)$/);
        if (r.counted.length === 0) expect(countedLine, ctx).toMatch(/none yet$/);
        else {
          const parts = m![1].split(" + ").map(Number);
          expect(parts.map(hundredths), ctx).toEqual(r.counted.map((c) => hundredths(c.score)));
          expect(hundredths(Number(m![2])), ctx).toBe(hundredths(r.components.tricks - r.components.penalty));
        }
        const imp = lines.find((l) => l.startsWith("Impression:"))!;
        if (r.impression?.score === null) expect(imp, ctx).toMatch(/not entered yet/);
        else expect(imp, ctx).toContain(`Impression: ${r.components.impression.toFixed(2)}`);
        const totalLine = lines.find((l) => l.startsWith("Total "))!;
        expect(totalLine, ctx).toMatch(new RegExp(`^Total ${r.total.toFixed(2).replace(".", "\\.")} \\(`));
        expect(hundredths(r.components.tricks - r.components.penalty + r.components.impression), ctx).toBe(hundredths(r.total));
      }
    }
  });
});

// ── 2. the panel: 4 scores, 3 scores, an absent judge, a judge who never gave an Impression ─────────────────────
const crit = (v: number) => ({ height: v, extremity: v, technicality: v, execution: v });
const landedBy = (seq: number, scores: Record<string, number | "missed">): Attempt => ({
  seq,
  status: "landed",
  marks: Object.entries(scores).map(([judgeId, v]) => ({ judgeId, value: v === "missed" ? "missed" : crit(v) })),
});
const heatOf = (riders: RiderInput[], panel = PANEL4): HeatInput => ({ panelJudgeIds: panel, riders });

describe("Audit 1a · scoring · the panel of 3 judges + head judge", () => {
  it("4 scores per attempt are a plain mean (no trimming below 5 judges): 6, 7, 8, 9 → 7.50", () => {
    const res = computeHeat(GOUNA, heatOf([{ riderId: "red", attempts: [landedBy(1, { J1: 6, J2: 7, J3: 8, HJ: 9 })] }]));
    expect(res.riders[0].allAttempts[0].panel?.score).toBe(7.5);
    expect(res.riders[0].allAttempts[0].panel?.judgeScores.some((j) => j.trimmed)).toBe(false);
  });

  it("a judge set Absent ('Missed') leaves the mean over the 3 who scored, with no blocker: 6, 7, 8 → 7.00", () => {
    const res = computeHeat(GOUNA, heatOf([{ riderId: "red", attempts: [landedBy(1, { J1: 6, J2: 7, J3: 8, HJ: "missed" })], impressionMarks: PANEL4.map((j) => ({ judgeId: j, value: 5 })) }]));
    expect(res.riders[0].allAttempts[0].panel?.score).toBe(7);
    expect(res.publishBlockers).toEqual([]);
  });

  it("a judge who has not entered yet: the live mean is over those who did, and publishing is blocked for that judge", () => {
    const res = computeHeat(GOUNA, heatOf([{ riderId: "red", attempts: [landedBy(1, { J1: 6, J2: 7, J3: 8 })], impressionMarks: PANEL4.map((j) => ({ judgeId: j, value: 5 })) }]));
    expect(res.riders[0].allAttempts[0].panel?.score).toBe(7);
    expect(res.publishBlockers).toEqual([{ type: "score_missing", judge: "HJ", rider: "red", attemptSeq: 1 }]);
  });

  it("a score from a judge not on the panel changes nothing and is reported", () => {
    const res = computeHeat(GOUNA, heatOf([{ riderId: "red", attempts: [landedBy(1, { J1: 6, J2: 7, J3: 8, HJ: 9, OFF: 0 })] }]));
    expect(res.riders[0].allAttempts[0].panel?.score).toBe(7.5);
    expect(res.ignoredMarksFrom).toEqual([{ judgeId: "OFF", riderId: "red", attemptSeq: 1 }]);
  });

  it("a judge who never gave an Impression: the Impression is the mean of the others, one blocker per rider; Absent clears it", () => {
    const marks = (hj: number | "missed" | null) => [...PANEL3.map((j) => ({ judgeId: j, value: 6 })), ...(hj === null ? [] : [{ judgeId: "HJ", value: hj }])] as ImpressionMark[];
    const riders = (hj: number | "missed" | null): RiderInput[] => ["red", "yellow", "blue"].map((id) => ({ riderId: id, attempts: [landedBy(1, { J1: 5, J2: 5, J3: 5, HJ: 5 })], impressionMarks: marks(hj) }));
    const open = computeHeat(GOUNA, heatOf(riders(null), PANEL4));
    expect(open.riders.map((r) => r.components.impression)).toEqual([6, 6, 6]);
    expect(open.publishBlockers.filter((b) => b.type === "impression_missing")).toHaveLength(3);
    const absent = computeHeat(GOUNA, heatOf(riders("missed"), PANEL4));
    expect(absent.publishBlockers.filter((b) => b.type === "impression_missing")).toHaveLength(0);
  });

  it("a crash with all 4 scores entered never counts and never blocks; a crash with none entered does not block either", () => {
    const crash: Attempt = { seq: 1, status: "crashed", marks: [] };
    const res = computeHeat(GOUNA, heatOf([{ riderId: "red", attempts: [crash, landedBy(2, { J1: 4, J2: 4, J3: 4, HJ: 4 })], impressionMarks: PANEL4.map((j) => ({ judgeId: j, value: 5 })) }]));
    expect(res.riders[0].counted.map((c) => c.attemptSeq)).toEqual([2]);
    expect(res.publishBlockers).toEqual([]);
  });
});

// ── 3. ties on every tie-breaker in turn ────────────────────────────────────────────────────────────────────────
const flat = (seq: number, v: number) => landedBy(seq, { J1: v, J2: v, J3: v, HJ: v });
const imp = (v: number): ImpressionMark[] => PANEL4.map((j) => ({ judgeId: j, value: v }));
const rider = (id: string, scores: number[], impression: number, extra: Attempt[] = []): RiderInput => ({ riderId: id, attempts: [...scores.map((v, i) => flat(i + 1, v)), ...extra], impressionMarks: imp(impression) });

describe("Audit 1a · scoring · ties on every tie-breaker in turn (all at 24.00)", () => {
  it("1. highest counted trick: 9 + 5 + 4 beats 8 + 7 + 3 (same 6.0 Impression)", () => {
    const res = computeHeat(GOUNA, heatOf([rider("A", [8, 7, 3], 6), rider("B", [9, 5, 4], 6)]));
    expect(res.ranking.map((r) => [r.riderId, r.place, r.total, r.tieResolvedBy])).toEqual([["B", 1, 24, "highest_counted_trick"], ["A", 2, 24, "highest_counted_trick"]]);
  });

  it("2. next counted trick: 9 + 6 + 3 beats 9 + 5 + 4", () => {
    const res = computeHeat(GOUNA, heatOf([rider("A", [9, 5, 4], 6), rider("B", [9, 6, 3], 6)]));
    expect(res.ranking.map((r) => [r.riderId, r.tieResolvedBy])).toEqual([["B", "next_counted_trick"], ["A", "next_counted_trick"]]);
  });

  it("2b. next counted trick reaches past the counted three: a 4th landed trick (2.0) beats none", () => {
    const res = computeHeat(GOUNA, heatOf([rider("A", [9, 6, 3], 6), rider("B", [9, 6, 3, 2], 6)]));
    expect(res.ranking.map((r) => [r.riderId, r.tieResolvedBy])).toEqual([["B", "next_counted_trick"], ["A", "next_counted_trick"]]);
  });

  it("3. Impression can never decide in this preset: equal totals with equal tricks force equal Impressions (finding A1a-6)", () => {
    // Exhaustive over small scores: whenever two riders tie on total and on both trick tie-breakers, their Impressions are equal too.
    let reached = 0;
    for (let a = 0; a <= 10; a++)
      for (let b = 0; b <= 10; b++)
        for (let ia = 0; ia <= 10; ia++)
          for (let ib = 0; ib <= 10; ib++) {
            if (a + ia !== b + ib) continue;
            const res = computeHeat(GOUNA, heatOf([rider("A", [a], ia), rider("B", [b], ib)]));
            if (res.ranking[0].tieResolvedBy === "impression") reached++;
          }
    expect(reached).toBe(0);
  });

  it("4. most landed: only reachable through a landed trick every judge marked Missed (no score)", () => {
    const allMissed = landedBy(4, { J1: "missed", J2: "missed", J3: "missed", HJ: "missed" });
    const res = computeHeat(GOUNA, heatOf([rider("A", [9, 6, 3], 6), rider("B", [9, 6, 3], 6, [allMissed])]));
    expect(res.ranking.map((r) => [r.riderId, r.tieResolvedBy])).toEqual([["B", "most_landed"], ["A", "most_landed"]]);
  });

  it("5. head judge: identical sheets stay tied and block publishing until the head judge decides", () => {
    const tied = heatOf([rider("A", [9, 6, 3], 6), rider("B", [9, 6, 3], 6), rider("C", [1], 1)]);
    const open = computeHeat(GOUNA, tied);
    expect(open.ranking.slice(0, 2).map((r) => [r.place, r.tieUnresolved])).toEqual([[1, true], [1, true]]);
    expect(open.publishBlockers).toContainEqual({ type: "tie_unresolved", riders: ["A", "B"] });
    const decided = computeHeat(GOUNA, { ...tied, headJudgeDecisions: [{ riderIds: ["B", "A"], reason: "better landing" }] });
    expect(decided.ranking.map((r) => [r.riderId, r.place, r.tieResolvedBy])).toEqual([["B", 1, "head_judge"], ["A", 2, "head_judge"], ["C", 3, undefined]]);
    expect(decided.publishBlockers).toEqual([]);
  });

  it("a three-way tie for the heat win (the only place that advances) is a blocker naming all three", () => {
    const res = computeHeat(GOUNA, heatOf([rider("A", [8, 8, 8], 0), rider("B", [8, 8, 8], 0), rider("C", [8, 8, 8], 0)]));
    expect(res.ranking.map((r) => r.place)).toEqual([1, 1, 1]);
    expect(res.publishBlockers).toEqual([{ type: "tie_unresolved", riders: ["A", "B", "C"] }]);
  });
});

// ── 4. scale limits and off-step values ──────────────────────────────────────────────────────────────────────────
describe("Audit 1a · scoring · scale limits and off-step values", () => {
  it("0 and 10 on every criterion are accepted: a perfect heat is 40.00 (100 %)", () => {
    const res = computeHeat(GOUNA, heatOf([rider("A", [10, 10, 10, 0, 0, 0, 0], 10)]));
    expect(res.riders[0].total).toBe(40);
    expect(res.riders[0].percent).toBe(100);
  });

  it("judgeTrickScore itself stays strict: an off-step or out-of-range value is a ScoringInputError (the low-level contract)", () => {
    for (const bad of [7.05, 10.1, -0.1, Number.NaN]) {
      expect(() => judgeTrickScore(GOUNA, { height: bad, extremity: 5, technicality: 5, execution: 5 }), String(bad)).toThrow(ScoringInputError);
    }
  });

  it("A1a-3: one off-step mark costs only that mark: every total of the heat still appears (fixed in 0.11.1)", () => {
    // The database stores numeric(5,2), so before this fix 7.25 or 10.5 could be stored. computeHeat used to throw for the whole heat.
    const res = computeHeat(GOUNA, heatOf([rider("A", [9, 6, 3], 6), { riderId: "B", attempts: [flat(1, 5)], impressionMarks: [{ judgeId: "J1", value: 7.25 }] }]));
    expect(res.riders.find((r) => r.riderId === "A")?.total).toBe(24);
    expect(res.riders.find((r) => r.riderId === "B")?.total).toBe(12.3); // 5.0 trick + the 7.25 rounded to 7.3
  });
});
