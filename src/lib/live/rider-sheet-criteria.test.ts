import { describe, expect, it } from "vitest";
import { computeHeat, judgeTrickScore } from "@/lib/engine/scoring";
import { hetx, J3, landed, preset } from "@/lib/engine/scoring/fixtures";
import { criteriaScore } from "@/lib/live/criteria";
import { activeLine, buildLines, criteriaComplete, criteriaFilled, lineDone, lineTypable, mergeCriterion, settleNotes, skipLines, type SheetAttempt, type SheetNote } from "@/lib/live/rider-sheet";

// A division scored by criteria on the judges' Rider sheet: the same line as before (attempt number, trick, Missed, Flag) with one box per criterion.
const KEYS = ["height", "extremity", "technicality"];
const att = (seq: number, status: "landed" | "crashed" = "landed", extra: Partial<SheetAttempt> = {}): SheetAttempt => ({ id: `a${seq}`, seq, status, trickName: `Trick ${seq}`, direction: null, deleted: false, ...extra });
const lines = (i: { attempts?: SheetAttempt[]; notes?: SheetNote[]; mine?: Map<string, number | "missed">; criteriaOf?: Map<string, Record<string, number>>; drafts?: Map<number, Record<string, number>>; cap?: number | null } = {}) =>
  buildLines({ attempts: i.attempts ?? [], notes: i.notes ?? [], cap: i.cap === undefined ? 7 : i.cap, mine: i.mine, criteriaKeys: KEYS, criteriaOf: i.criteriaOf, drafts: i.drafts });

describe("criteria on a Rider sheet line", () => {
  it("a value for every criterion makes it complete; a missing or empty one does not", () => {
    expect(criteriaComplete(KEYS, { height: 7, extremity: 8, technicality: 6.5 })).toBe(true);
    expect(criteriaComplete(KEYS, { height: 7, extremity: 8 })).toBe(false);
    expect(criteriaComplete(KEYS, {})).toBe(false);
    expect(criteriaComplete(KEYS, { height: 7, extremity: 8, technicality: Number.NaN })).toBe(false);
    expect(criteriaComplete([], {})).toBe(false); // a model with no criteria has no criteria line
    expect(criteriaFilled(KEYS, { height: 7, other: 3 })).toBe(1);
  });

  it("typing one box keeps the other boxes as they were (any order)", () => {
    const a = mergeCriterion({}, "extremity", 8);
    const b = mergeCriterion(a, "height", 7);
    expect(b).toEqual({ extremity: 8, height: 7 });
    expect(mergeCriterion(b, "extremity", 9)).toEqual({ extremity: 9, height: 7 });
  });

  it("a line is done only when every criterion has a score, or it is Missed or a crash", () => {
    const attempts = [att(1), att(2), att(3, "crashed"), att(4)];
    const all = lines({
      attempts,
      mine: new Map<string, number | "missed">([["a1", 7.2], ["a4", "missed"]]),
      criteriaOf: new Map([["a1", { height: 7, extremity: 8, technicality: 6.5 }]]),
      drafts: new Map([[2, { height: 7, extremity: 8 }]]),
    });
    const byN = (n: number) => all.find((l) => l.n === n)!;
    expect(lineDone(byN(1))).toBe(true); // every criterion scored
    expect(byN(1).criteria).toEqual({ height: 7, extremity: 8, technicality: 6.5 });
    expect(lineDone(byN(2))).toBe(false); // two of three
    expect(byN(2).criteria).toEqual({ height: 7, extremity: 8 });
    expect(lineDone(byN(3))).toBe(true); // greyed by a crash
    expect(lineDone(byN(4))).toBe(true); // Missed
    expect(lineDone(byN(5))).toBe(false); // the spotter has not logged it, nothing typed
  });

  it("only the first line that is not done takes typing", () => {
    const attempts = [att(1), att(2), att(3)];
    const l = lines({ attempts, mine: new Map<string, number | "missed">([["a1", 7]]), drafts: new Map([[2, { height: 7 }]]) });
    expect(activeLine(l)).toBe(2);
    expect(lineTypable(l, 1)).toBe(true); // a scored line can still be changed
    expect(lineTypable(l, 2)).toBe(true);
    expect(lineTypable(l, 3)).toBe(false); // waits for line 2
    expect(skipLines(l, 3)).toEqual([2]); // one tap can set line 2 to Missed and move on
  });

  it("Missed moves on, a crash is skipped", () => {
    const l = lines({ attempts: [att(1), att(2, "crashed"), att(3)], mine: new Map<string, number | "missed">([["a1", "missed"]]) });
    expect(activeLine(l)).toBe(3);
  });

  it("scores typed before the spotter logs wait on the empty line, and cover the attempt when it arrives", () => {
    const note: SheetNote = { seatId: "J1", slot: 1, score: 7.17, criteria: { height: 7, extremity: 8, technicality: 6.5 } };
    const before = lines({ notes: [note] });
    expect(before[0].kind).toBe("empty");
    expect(before[0].pending).toBe(7.17);
    expect(before[0].criteria).toEqual(note.criteria);
    expect(lineDone(before[0])).toBe(true);
    expect(activeLine(before)).toBe(2);
    // the spotter logs the attempt: the line is covered by what the judge typed until the server's score arrives
    const after = lines({ attempts: [att(1)], notes: [note] });
    expect(after[0].kind).toBe("attempt");
    expect(after[0].mine).toBe(7.17);
    expect(after[0].criteria).toEqual(note.criteria);
  });

  it("a note settles onto the attempt as that judge's criteria score; a crash discards it", () => {
    const note: SheetNote = { seatId: "J1", slot: 1, score: 7.17, criteria: { height: 7, extremity: 8, technicality: 6.5 } };
    const landed = settleNotes([att(1)], [note]);
    expect(landed.scores).toEqual([{ attemptId: "a1", seatId: "J1", score: 7.17, criteria: note.criteria }]);
    expect(settleNotes([att(1, "crashed")], [note]).discarded).toHaveLength(1);
    expect(settleNotes([], [note]).remaining).toHaveLength(1);
  });

  it("a single-score line is unchanged by all of this", () => {
    const l = buildLines({ attempts: [att(1)], notes: [], cap: 7 });
    expect(l[0].criteria).toBeUndefined();
  });
});

describe("a criteria heat scored on the Rider sheet gives exactly the Queue's panel scores and totals", () => {
  const model = preset("kota-best3-impression");
  const K4 = ["height", "extremity", "technicality", "execution"];
  // three judges, three attempts: the criteria each judge gave
  const given = [
    [hetx(8.0, 7.5, 7.0, 8.0), hetx(8.5, 8.0, 7.0, 7.5), hetx(8.0, 7.5, 7.5, 8.0)],
    [hetx(9.0, 9.0, 8.0, 7.0), hetx(9.0, 8.5, 8.0, 7.5), hetx(8.5, 9.0, 8.5, 7.0)],
    [hetx(7.0, 7.0, 6.5, 8.5), hetx(7.5, 7.0, 7.0, 8.0), hetx(7.0, 6.5, 7.0, 8.5)],
  ];
  const heatOf = (marks: Array<Array<Record<string, number>>>) => computeHeat(model, { panelJudgeIds: J3, riders: [{ riderId: "Red", attempts: marks.map((m, i) => landed(i + 1, m, { trickName: `Trick ${i + 1}` })) }] });

  it("the sheet sends the same criteria and the same trick score the Queue sends", () => {
    for (const values of given.flat() as Array<Record<string, number>>) {
      const queue = { criteria: values, score: criteriaScore(model, values) };
      // the Rider sheet: boxes merged one at a time, in the opposite order, then the same computation
      let v: Record<string, number> = {};
      for (const k of [...K4].reverse()) v = mergeCriterion(v, k, values[k]);
      expect(criteriaComplete(K4, v)).toBe(true);
      const sheet = { criteria: v, score: criteriaScore(model, v) };
      expect(sheet).toEqual(queue);
      expect(sheet.score).toBe(judgeTrickScore(model, values).score);
    }
  });

  it("scores that waited as notes and settled give the same panel scores, counted tricks and total as the Queue", () => {
    const attempts = [att(1), att(2), att(3)];
    // each judge's note per line, as the phone writes it, settled in order of logging
    const settled = J3.map((j, ji) => settleNotes(attempts, given.map((_, ai) => ({ seatId: j, slot: ai + 1, score: criteriaScore(model, given[ai][ji])!, criteria: given[ai][ji] }))).scores);
    const viaNotes = given.map((_, ai) => settled.map((per) => per.find((s) => s.attemptId === `a${ai + 1}`)!.criteria!));
    expect(viaNotes).toEqual(given);
    const queue = heatOf(given);
    const sheet = heatOf(viaNotes);
    expect(sheet.riders[0].allAttempts.map((a) => a.panel?.score ?? null)).toEqual(queue.riders[0].allAttempts.map((a) => a.panel?.score ?? null));
    expect(sheet.riders[0].total).toBe(queue.riders[0].total);
    expect(sheet.riders[0].counted).toEqual(queue.riders[0].counted);
    expect(sheet).toEqual(queue);
  });
});
