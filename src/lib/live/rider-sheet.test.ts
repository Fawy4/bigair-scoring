import { describe, expect, it } from "vitest";
import { computeHeat } from "@/lib/engine/scoring";
import { preset } from "@/lib/engine/scoring/fixtures";
import {
  activeLine,
  allowedLine,
  buildLines,
  lineDone,
  lineTypable,
  needsScore,
  rangesOf,
  skipLines,
  consoleRows,
  lineOfSlot,
  noteBlockers,
  settleNotes,
  slotForLine,
  submitBlockLines,
  type SheetAttempt,
  type SheetNote,
  viewPreference,
} from "./rider-sheet";

// The Rider sheet (judge screen): a judge types a score on a numbered line BEFORE the spotter has logged the attempt. The note is kept as "pending" on the server;
// the attempt that takes that line later adopts the note as that judge's score. These tests state the matching rule in plain cases; tests/rls/rider-sheet.test.ts
// proves the database does the same.
const att = (seq: number, status: "landed" | "crashed" = "landed", deleted = false): SheetAttempt => ({ id: `a${seq}`, seq, status, trickName: `Trick ${seq}`, direction: "left", deleted });
const note = (slot: number, score: number, seat = "J1"): SheetNote => ({ seatId: seat, slot, score });

describe("lines of a rider's sheet", () => {
  it("with a cap there are exactly N numbered lines from the start of the heat (7 for Arrow)", () => {
    const lines = buildLines({ attempts: [], notes: [], cap: 7 });
    expect(lines.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(lines.every((l) => l.kind === "empty")).toBe(true);
  });

  it("logged attempts fill their lines, in the order they were logged; the rest stay empty", () => {
    const lines = buildLines({ attempts: [att(1), att(2, "crashed"), att(3)], notes: [], cap: 7 });
    expect(lines.map((l) => l.kind)).toEqual(["attempt", "crash", "attempt", "empty", "empty", "empty", "empty"]);
    expect(lines[0].trickName).toBe("Trick 1");
    expect(lines[1].kind).toBe("crash");
  });

  it("with no cap: 10 lines from the start, like the spotter's sheet, whatever the spotter has logged", () => {
    expect(buildLines({ attempts: [], notes: [], cap: null }).map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const lines = buildLines({ attempts: [att(1), att(2)], notes: [], cap: null });
    expect(lines.map((l) => l.kind).slice(0, 4)).toEqual(["attempt", "attempt", "empty", "empty"]);
    expect(lines).toHaveLength(10);
  });

  it("with no cap, every time the last line is filled a new empty line appears under it at once, so the judge never runs out", () => {
    const withLast = (extra: Partial<Parameters<typeof buildLines>[0]>) => buildLines({ attempts: [], notes: [], cap: null, ...extra });
    // line 10 holds a note (nothing logged): line 11 appears
    const notes = Array.from({ length: 10 }, (_, i) => note(i + 1, 5));
    expect(withLast({ notes }).map((l) => l.n)).toHaveLength(11);
    expect(withLast({ notes })[10]).toMatchObject({ n: 11, kind: "empty", pending: null });
    // line 11 filled too: line 12
    expect(withLast({ notes: [...notes, note(11, 6)] })).toHaveLength(12);
    // line 10 empty: no new line
    expect(withLast({ notes: notes.slice(0, 9) })).toHaveLength(10);
    // a Missed note on the last line counts as filled
    expect(withLast({ notes: [...notes.slice(0, 9), { seatId: "J1", slot: 10, score: 0, missed: true }] })).toHaveLength(11);
    // ten attempts logged and scored: line 11 is there for the next one
    const ten = Array.from({ length: 10 }, (_, i) => att(i + 1));
    const mine = new Map(ten.map((a) => [a.id, 7] as [string, number]));
    expect(buildLines({ attempts: ten, notes: [], cap: null, mine })).toHaveLength(11);
    expect(buildLines({ attempts: ten, notes: [], cap: null })).toHaveLength(10); // last line has an attempt but no score yet: it is the line to score
  });

  it("with no limit the server keeps a score only one line ahead of the attempts logged: the other lines are shown, and wait", () => {
    const lines = buildLines({ attempts: [att(1), att(2)], notes: [], cap: null, mine: new Map([["a1", 7], ["a2", 8]]) });
    expect(lines.map((l) => l.open).slice(0, 5)).toEqual([true, true, true, false, false]);
    expect(lineTypable(lines, 3)).toBe(true);
    expect(lineTypable(lines, 5)).toBe(false);
    expect(skipLines(lines, 5)).toEqual([]); // nothing the sheet can mark there yet
    // with a limit every line is open
    expect(buildLines({ attempts: [], notes: [], cap: 7 }).every((l) => l.open)).toBe(true);
  });

  it("a capped division never grows: the cap is the number of lines", () => {
    const notes = Array.from({ length: 7 }, (_, i) => note(i + 1, 5));
    expect(buildLines({ attempts: [], notes, cap: 7 })).toHaveLength(7);
  });

  it("an attempt the head judge added past the cap gets its own line (the sheet never hides a logged attempt)", () => {
    const lines = buildLines({ attempts: [1, 2, 3, 4].map((n) => att(n)), notes: [], cap: 3 });
    expect(lines.map((l) => l.n)).toEqual([1, 2, 3, 4]);
    expect(lines.every((l) => l.kind === "attempt")).toBe(true);
  });

  it("a deleted attempt leaves the sheet and the lines renumber", () => {
    const lines = buildLines({ attempts: [att(1), att(2, "landed", true), att(3)], notes: [], cap: 4 });
    expect(lines.map((l) => [l.n, l.kind, l.attemptId])).toEqual([
      [1, "attempt", "a1"],
      [2, "attempt", "a3"],
      [3, "empty", undefined],
      [4, "empty", undefined],
    ]);
  });

  it("a pending note shows on its empty line; the line says it has no attempt yet", () => {
    const lines = buildLines({ attempts: [att(1)], notes: [note(3, 7.5)], cap: 7 });
    expect(lines[2]).toMatchObject({ n: 3, kind: "empty", pending: 7.5 });
    expect(lines[1]).toMatchObject({ n: 2, kind: "empty", pending: null });
  });

  it("a line with an attempt shows this judge's score on it", () => {
    const lines = buildLines({ attempts: [att(1), att(2)], notes: [], cap: 7, mine: new Map([["a2", 8.5]]) });
    expect(lines[0].mine).toBeNull();
    expect(lines[1].mine).toBe(8.5);
  });
});

describe("where a note is kept", () => {
  it("an empty line n is kept under the attempt number it will become", () => {
    expect(slotForLine([att(1)], 3)).toBe(3);
    expect(slotForLine([], 1)).toBe(1);
  });

  it("after a deletion the same line is the next attempt number but one (numbers are never reused)", () => {
    // attempts 1,2,3 logged, 2 deleted: two live, so the next attempt is number 4 and is line 3
    const a = [att(1), att(2, "landed", true), att(3)];
    expect(slotForLine(a, 3)).toBe(4);
    expect(slotForLine(a, 4)).toBe(5);
    expect(lineOfSlot(a, 4)).toBe(3);
  });

  it("a line that already has an attempt has no note slot", () => {
    expect(slotForLine([att(1), att(2)], 2)).toBeNull();
  });

  it("which empty lines may hold a note: up to the cap; with no cap only the one line ahead", () => {
    expect(allowedLine([att(1)], 7, 7)).toBe(true);
    expect(allowedLine([att(1)], 7, 8)).toBe(false);
    expect(allowedLine([att(1), att(2)], null, 3)).toBe(true);
    expect(allowedLine([att(1), att(2)], null, 4)).toBe(false);
    expect(allowedLine([att(1), att(2)], 7, 2)).toBe(false); // that line has an attempt: it is a score, not a note
  });
});

describe("matching: a logged attempt takes the lowest line with no attempt, and adopts that line's note", () => {
  it("notes on lines 1–3, the spotter logs three attempts: each takes its own line's note, in order of logging", () => {
    const r = settleNotes([att(1), att(2), att(3)], [note(1, 7), note(2, 6), note(3, 8)]);
    expect(r.scores).toEqual([
      { attemptId: "a1", seatId: "J1", score: 7 },
      { attemptId: "a2", seatId: "J1", score: 6 },
      { attemptId: "a3", seatId: "J1", score: 8 },
    ]);
    expect(r.remaining).toEqual([]);
  });

  it("the time the note was typed does not matter: a note typed first for line 3 still waits for the third attempt", () => {
    const typedFirst = note(3, 9);
    const typedLast = note(1, 5);
    const r = settleNotes([att(1)], [typedFirst, typedLast]);
    expect(r.scores).toEqual([{ attemptId: "a1", seatId: "J1", score: 5 }]);
    expect(r.remaining).toEqual([typedFirst]);
  });

  it("a crash greys its line and discards the notes on it; the other lines still land", () => {
    const r = settleNotes([att(1), att(2, "crashed"), att(3)], [note(1, 7), note(2, 6), note(3, 8), note(2, 4, "J3")]);
    expect(r.scores.map((s) => [s.attemptId, s.score])).toEqual([
      ["a1", 7],
      ["a3", 8],
    ]);
    expect(r.discarded.map((n) => [n.slot, n.seatId])).toEqual([
      [2, "J1"],
      [2, "J3"],
    ]);
    expect(r.remaining).toEqual([]);
  });

  it("every judge's note on the line lands for that judge (notes are per judge)", () => {
    const r = settleNotes([att(1)], [note(1, 7, "J1"), note(1, 7.5, "J3"), note(2, 5, "J1")]);
    expect(r.scores.map((s) => [s.seatId, s.score])).toEqual([
      ["J1", 7],
      ["J3", 7.5],
    ]);
    expect(r.remaining).toEqual([note(2, 5, "J1")]);
  });

  it("deleting a logged attempt: the notes behind it shift up one line, and the next attempt still takes the lowest empty line", () => {
    // 1,2 logged; notes on lines 3 and 4; the head judge deletes attempt 2
    const notes = [note(3, 6), note(4, 8)];
    const before = [att(1), att(2)];
    expect(notes.map((n) => lineOfSlot(before, n.slot))).toEqual([3, 4]);
    const after = [att(1), att(2, "landed", true)];
    expect(notes.map((n) => lineOfSlot(after, n.slot))).toEqual([2, 3]);
    // the spotter logs the next attempt: it is number 3 (numbers are never reused) and is line 2, so it adopts the note that is now on line 2
    const next = [...after, att(3)];
    const r = settleNotes(next, notes);
    expect(r.scores).toEqual([{ attemptId: "a3", seatId: "J1", score: 6 }]);
    expect(r.remaining.map((n) => lineOfSlot(next, n.slot))).toEqual([3]); // the note that was on line 4 is now on line 3, right after the two attempts
  });

  it("merging two attempts is a delete of the second: the notes behind shift up the same way", () => {
    const next = [att(1), att(2, "landed", true), att(3)];
    expect(lineOfSlot(next, 5)).toBe(4);
    expect(lineOfSlot(next, 4)).toBe(3);
  });

  it("an attempt nobody typed a note for takes no score", () => {
    expect(settleNotes([att(1)], [])).toEqual({ scores: [], discarded: [], remaining: [] });
  });

  it("attempt numbers are never reused: attempt 2 after a deleted attempt 1 takes the note kept under 2", () => {
    const r = settleNotes([att(1, "landed", true), att(2)], [note(2, 6)]);
    expect(r.scores).toEqual([{ attemptId: "a2", seatId: "J1", score: 6 }]);
  });
});

describe("the console: pending rows", () => {
  const notes = [note(3, 6, "J1"), note(3, 7, "J3"), note(4, 5, "J1")];
  it("one pending row per line that holds a note, after the logged attempts, each judge's note in that judge's column", () => {
    const rows = consoleRows([att(1), att(2)], notes);
    expect(rows.map((r) => [r.n, r.judges, r.cells.J1 ?? null, r.cells.J3 ?? null])).toEqual([
      [3, ["J1", "J3"], 6, 7],
      [4, ["J1"], 5, null],
    ]);
  });

  it("when the spotter logs, the first pending row becomes the attempt (it is no longer a pending row)", () => {
    const rows = consoleRows([att(1), att(2), att(3)], notes.filter((n) => n.slot !== 3));
    expect(rows.map((r) => r.n)).toEqual([4]);
  });

  it("the publish blocker names the rider and the judge", () => {
    expect(noteBlockers([{ entryId: "E1", ...note(3, 6, "J3") }, { entryId: "E1", ...note(4, 6, "J3") }, { entryId: "E2", ...note(1, 2, "J1") }])).toEqual([
      { entryId: "E1", seatId: "J3", lines: [3, 4] },
      { entryId: "E2", seatId: "J1", lines: [1] },
    ]);
  });
});

describe("Submit at the end of the heat", () => {
  it("is refused while the judge still has pending notes, and says which lines (per rider)", () => {
    const r = submitBlockLines([{ entryId: "E1", ...note(3, 6) }, { entryId: "E1", ...note(5, 6) }, { entryId: "E2", ...note(2, 6) }], (id) => ({ attempts: id === "E1" ? [att(1), att(2)] : [att(1)] }));
    expect(r).toEqual([
      { entryId: "E1", lines: [3, 5] },
      { entryId: "E2", lines: [2] },
    ]);
  });
  it("is free to go when there are none", () => {
    expect(submitBlockLines([], () => ({ attempts: [] }))).toEqual([]);
  });
});

// ---- mixed views: Queue judges and Rider-sheet judges score one heat, and it makes no difference to the result
describe("mixed views: two judges on the Queue and two on the Rider sheet", () => {
  const model = preset("legacy-kol-best3-variety");
  const judges = ["J1", "J2", "J3", "J4"] as const;
  const jumps = [
    { status: "landed" as const, marks: { J1: 7, J2: 7.5, J3: 6.5, J4: 7 } },
    { status: "crashed" as const, marks: {} },
    { status: "landed" as const, marks: { J1: 8, J2: 8.5, J3: 8, J4: 7.5 } },
    { status: "landed" as const, marks: { J1: 5, J2: 5.5, J3: 6, J4: 5 } },
  ];
  const attempts = jumps.map((j, i) => att(i + 1, j.status));

  // Queue judges (J1, J2) score when the attempt lands; Rider-sheet judges (J3, J4) typed their notes beforehand
  const notesFor = (seat: string) => jumps.flatMap((j, i) => (j.status === "landed" && seat in j.marks ? [note(i + 1, (j.marks as Record<string, number>)[seat], seat)] : []));
  const sheetNotes = [...notesFor("J3"), ...notesFor("J4")];
  const settled = settleNotes(attempts, sheetNotes);
  const scoreOf = (attemptId: string, seat: string): number | undefined => {
    const queue = ["J1", "J2"].includes(seat) ? jumps[Number(attemptId.slice(1)) - 1].marks : {};
    const typed = settled.scores.find((s) => s.attemptId === attemptId && s.seatId === seat)?.score;
    return (queue as Record<string, number>)[seat] ?? typed;
  };

  const heat = (marksOf: (attemptId: string, seat: string) => number | undefined) =>
    computeHeat(model, {
      panelJudgeIds: [...judges],
      riders: [
        {
          riderId: "R",
          attempts: attempts.map((a) => ({
            seq: a.seq,
            status: a.status,
            trickName: a.trickName ?? undefined,
            marks: judges.flatMap((j) => {
              const v = a.status === "landed" ? marksOf(a.id, j) : undefined;
              return v === undefined ? [] : [{ judgeId: j, value: v }];
            }),
          })),
          impressionMarks: judges.map((j) => ({ judgeId: j, value: 6 })),
        },
      ],
    });

  it("the console has four scores on every landed attempt, and none on the crash", () => {
    for (const a of attempts) {
      const seats = judges.filter((j) => scoreOf(a.id, j) !== undefined);
      expect(seats).toHaveLength(a.status === "landed" ? 4 : 0);
    }
    expect(settled.remaining).toEqual([]);
  });

  it("the heat total equals the engine's total when every judge scored at the moment of landing", () => {
    const direct = heat((id, seat) => (jumps[Number(id.slice(1)) - 1].marks as Record<string, number>)[seat]);
    const mixed = heat(scoreOf);
    expect(mixed.riders[0].total).toBe(direct.riders[0].total);
    expect(mixed.riders[0].counted.map((c) => c.attemptSeq)).toEqual(direct.riders[0].counted.map((c) => c.attemptSeq));
    expect(mixed.publishBlockers).toEqual(direct.publishBlockers);
    // the best three of the landed tricks: attempts 3, 1 and 4 (panel means 8.0, 7.0, 5.375 ...) — nothing is left pending
    expect(mixed.riders[0].counted).toHaveLength(3);
  });

  it("the view is a per-device choice, kept apart from the scores: the Rider sheet unless the device chose the Queue", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(viewPreference.read(storage)).toBe("sheet");
    viewPreference.write("queue", storage);
    expect(viewPreference.read(storage)).toBe("queue");
    viewPreference.write("sheet", storage);
    expect(viewPreference.read(storage)).toBe("sheet");
    store.set(viewPreference.key, "nonsense");
    expect(viewPreference.read(storage)).toBe("sheet");
    expect(viewPreference.read(null)).toBe("sheet");
    expect(viewPreference.read({ getItem: () => { throw new Error("blocked"); } })).toBe("sheet");
  });
});

// ---- line by line: a score can only land on the first line of the rider that has no score yet
describe("the judge types only on the first line with no score yet", () => {
  const scored = (...scores: Array<number | "missed" | null>) => {
    const mine = new Map<string, number | "missed">();
    scores.forEach((s, i) => {
      if (s !== null) mine.set(`a${i + 1}`, s);
    });
    return mine;
  };

  it("on a fresh sheet only line 1 takes a score; the lines below wait", () => {
    const lines = buildLines({ attempts: [], notes: [], cap: 7 });
    expect(activeLine(lines)).toBe(1);
    expect(lineTypable(lines, 1)).toBe(true);
    for (const n of [2, 3, 7]) expect(lineTypable(lines, n)).toBe(false);
  });

  it("a line with a score (or a note typed ahead of the spotter) is done and opens the next one", () => {
    const lines = buildLines({ attempts: [att(1), att(2)], notes: [note(3, 6)], cap: 7, mine: scored(7.5, null) });
    // line 1 scored, line 2 has an attempt and no score, line 3 holds a note
    expect(lines.map(lineDone).slice(0, 4)).toEqual([true, false, true, false]);
    expect(activeLine(lines)).toBe(2);
    expect(lineTypable(lines, 3)).toBe(false); // it holds a note, but line 2 comes first: the note is changed again only when line 2 is done
  });

  it("a filled line can still be changed until Submit: every line up to the first empty one takes typing", () => {
    const lines = buildLines({ attempts: [att(1), att(2), att(3)], notes: [], cap: 7, mine: scored(7, 8, null) });
    expect(activeLine(lines)).toBe(3);
    expect([1, 2, 3].map((n) => lineTypable(lines, n))).toEqual([true, true, true]);
    expect(lineTypable(lines, 4)).toBe(false);
  });

  it("a line greyed by a crash counts as done", () => {
    const lines = buildLines({ attempts: [att(1), att(2, "crashed"), att(3)], notes: [], cap: 7, mine: scored(7) });
    expect(lineDone(lines[1])).toBe(true);
    expect(activeLine(lines)).toBe(3);
  });

  it("Missed counts as done and opens the next line (an attempt, or a line the spotter has not logged yet)", () => {
    const withAttempt = buildLines({ attempts: [att(1), att(2)], notes: [], cap: 7, mine: scored(7, "missed") });
    expect(lineDone(withAttempt[1])).toBe(true);
    expect(activeLine(withAttempt)).toBe(3);
    const ahead = buildLines({ attempts: [att(1)], notes: [{ seatId: "J1", slot: 2, score: 0, missed: true }, ], cap: 7, mine: scored(7) });
    expect(ahead[1]).toMatchObject({ kind: "empty", pending: "missed" });
    expect(lineDone(ahead[1])).toBe(true);
    expect(activeLine(ahead)).toBe(3);
    expect(lineTypable(ahead, 3)).toBe(true);
  });

  it("when every line is done, every line takes typing until Submit", () => {
    const lines = buildLines({ attempts: [att(1), att(2)], notes: [], cap: 2, mine: scored(7, 8) });
    expect(activeLine(lines)).toBeNull();
    expect(lines.map((l) => lineTypable(lines, l.n))).toEqual([true, true]);
  });

  it("with no limit the rule holds the same way: the first line without a score is the active one", () => {
    const lines = buildLines({ attempts: [att(1)], notes: [], cap: null, mine: scored(7) });
    expect(lines).toHaveLength(10);
    expect(activeLine(lines)).toBe(2);
  });
});

// ---- the judge never waits for the spotter
describe("scoring ahead of the spotter", () => {
  it("the first line without a score takes a score at once, logged or not, and a pending note counts as a score for the rule: typing ahead always works", () => {
    // the spotter has logged nothing: the judge types line 1, line 2, line 3, each time the next one opens
    let notes: SheetNote[] = [];
    for (const n of [1, 2, 3]) {
      const lines = buildLines({ attempts: [], notes, cap: 7 });
      expect(activeLine(lines)).toBe(n);
      expect(lineTypable(lines, n)).toBe(true);
      expect(lines[n - 1].kind).toBe("empty"); // the attempt does not exist yet
      notes = [...notes, note(n, 6 + n / 10)];
    }
    expect(activeLine(buildLines({ attempts: [], notes, cap: 7 }))).toBe(4);
  });

  it("the spotter two jumps behind: lines 1 and 2 have attempts (no score yet), line 3 is empty: the judge scores 1, 2, then 3 straight away", () => {
    const attempts = [att(1), att(2)];
    let mine = new Map<string, number | "missed">();
    expect(activeLine(buildLines({ attempts, notes: [], cap: 7, mine }))).toBe(1);
    mine = new Map([["a1", 7]]);
    expect(activeLine(buildLines({ attempts, notes: [], cap: 7, mine }))).toBe(2);
    mine = new Map([["a1", 7], ["a2", 8]]);
    const lines = buildLines({ attempts, notes: [], cap: 7, mine });
    expect(activeLine(lines)).toBe(3);
    expect(lines[2].kind).toBe("empty");
    expect(lineTypable(lines, 3)).toBe(true);
  });

  it("the notes attach to the rider's next logged attempts in order", () => {
    const notes = [note(1, 7), note(2, 8), note(3, 6)];
    const got = settleNotes([att(1), att(2), att(3)], notes);
    expect(got.scores.map((x) => [x.attemptId, x.score])).toEqual([["a1", 7], ["a2", 8], ["a3", 6]]);
  });
});

describe("tapping a line below an empty one asks once", () => {
  const mineOf = (...v: Array<number | "missed" | null>) => new Map(v.flatMap((x, i) => (x === null ? [] : [[`a${i + 1}`, x] as [string, number | "missed"]])));

  it("lists the lines above that have no score from this judge", () => {
    const lines = buildLines({ attempts: [att(1), att(2), att(3)], notes: [], cap: 7, mine: mineOf() });
    expect(skipLines(lines, 4)).toEqual([1, 2, 3]);
    expect(skipLines(lines, 3)).toEqual([1, 2]);
    expect(skipLines(lines, 2)).toEqual([1]);
  });

  it("nothing to ask for the active line or any line above it (they take a score at once), nor for a line whose lines above are all done", () => {
    const lines = buildLines({ attempts: [att(1), att(2)], notes: [], cap: 7, mine: mineOf(7) });
    expect(skipLines(lines, 1)).toEqual([]);
    expect(skipLines(lines, 2)).toEqual([]);
    expect(skipLines(lines, 3)).toEqual([2]);
  });

  it("lines already done (a score, a note, Missed, a crash) are not marked again", () => {
    const lines = buildLines({ attempts: [att(1), att(2, "crashed"), att(3)], notes: [], cap: 7, mine: mineOf("missed") });
    expect(skipLines(lines, 4)).toEqual([3]);
    const ahead = buildLines({ attempts: [], notes: [note(1, 5)], cap: 7 });
    expect(skipLines(ahead, 4)).toEqual([2, 3]);
  });

  it("the question names the lines as ranges: 1–2, 1–3, 1, 1–2 and 4", () => {
    expect(rangesOf([1, 2])).toBe("1–2");
    expect(rangesOf([1, 2, 3])).toBe("1–3");
    expect(rangesOf([1])).toBe("1");
    expect(rangesOf([1, 2, 4])).toBe("1–2 and 4");
    expect(rangesOf([2, 4, 6])).toBe("2, 4 and 6");
  });

  it("after the answer (those lines Missed) the tapped line is the active one and takes a score; a Missed line can still be given a score", () => {
    const attempts = [att(1), att(2), att(3)];
    const lines = buildLines({ attempts, notes: [], cap: 7, mine: mineOf("missed", "missed", "missed") });
    expect(activeLine(lines)).toBe(4);
    expect(lineTypable(lines, 4)).toBe(true);
    expect([1, 2, 3].map((n) => lineTypable(lines, n))).toEqual([true, true, true]); // a Missed line can still be given a score until Submit
  });
});

describe("a Missed note on a line the spotter has not logged", () => {
  it("becomes the judge's Missed on the attempt that takes the line, and nothing else", () => {
    const got = settleNotes([att(1), att(2)], [{ seatId: "J1", slot: 2, score: 0, missed: true }, note(1, 7)]);
    expect(got.scores).toEqual([
      { attemptId: "a1", seatId: "J1", score: 7 },
      { attemptId: "a2", seatId: "J1", score: null, missed: true },
    ]);
    expect(got.remaining).toEqual([]);
  });
  it("a crash discards it like any note", () => {
    const got = settleNotes([att(1, "crashed")], [{ seatId: "J1", slot: 1, score: 0, missed: true }]);
    expect(got.scores).toEqual([]);
    expect(got.discarded).toHaveLength(1);
  });
  it("the head judge's pending row names it 'Missed' instead of a number", () => {
    const rows = consoleRows([], [{ seatId: "J1", slot: 1, score: 0, missed: true }]);
    expect(rows[0].missed).toEqual({ J1: true });
  });

describe("which lines are highlighted as needing a score", () => {
  const mineOf = (...v: Array<number | "missed" | null>) => new Map(v.flatMap((x, i) => (x === null ? [] : [[`a${i + 1}`, x] as [string, number | "missed"]])));
  it("a logged attempt with no score from this judge needs one; a scored, Missed or crashed line, and an empty line the spotter has not logged, do not", () => {
    const lines = buildLines({ attempts: [att(1), att(2), att(3, "crashed"), att(4), att(5)], notes: [note(6, 5)], cap: 7, mine: mineOf(7, "missed", null, null) });
    expect(lines.map(needsScore)).toEqual([false, false, false, true, true, false, false]);
  });
  it("it follows the judge: scoring a line takes the highlight off, and a note typed ahead on an empty line never had one", () => {
    const before = buildLines({ attempts: [att(1), att(2)], notes: [], cap: 7 });
    expect(before.filter(needsScore).map((l) => l.n)).toEqual([1, 2]);
    const after = buildLines({ attempts: [att(1), att(2)], notes: [], cap: 7, mine: mineOf(7) });
    expect(after.filter(needsScore).map((l) => l.n)).toEqual([2]);
  });
});
});
