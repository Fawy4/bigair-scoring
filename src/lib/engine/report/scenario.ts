import { att, ctxOf, ENTRIES, FINAL_ADVANCE, heat, R1_ADVANCE, res, round } from "./fixture";
import type { ReportContext } from "./types";

/**
 * The example event of the report tests. Six made-up riders; Round 1 has two heats (the winner of each goes to the Final), the Final has two riders.
 *   Ana  won Round 1 Heat 1 (21.70), then took 2nd in the Final (22.50)        Di  won Round 1 Heat 2 (20.00), then won the Final (24.50)
 *   Ben  2nd in Heat 1 (9.00), out        Cy  3rd in Heat 1 (3.00), out         Eli, Flo  2nd and 3rd in Heat 2, out
 */
export function scenario(): ReportContext {
  const h1 = heat(1, [
    res("a", 1, [
      att(1, { kind: "backroll2BoardOff", score: 5, counted: true, at: 60 }),
      att(2, { kind: "kiteloop", status: "crashed", side: "right", at: 130 }),
      att(3, { kind: "kiteloop", score: 6, counted: true, at: 200 }),
      att(4, { kind: "boardOffBackroll2", score: 5.2, counted: true, side: "right", at: 300 }),
      att(5, { kind: "megaloop", score: 4, side: "right", at: 420 }),
    ], { impression: 5.5 }),
    res("b", 2, [
      att(1, { kind: "backroll", score: 3, counted: true, at: 100 }),
      att(2, { kind: "backroll", status: "crashed", at: 200 }),
      att(3, { kind: "backroll", status: "crashed", at: 300 }),
      att(4, { kind: "jump", score: 2, counted: true, side: "right", at: 500 }),
    ], { impression: 4 }),
    res("c", 3, [att(1, { kind: "kiteloop", status: "crashed", side: "right", at: 250 }), att(2, { kind: "kiteloop", status: "crashed", side: "right", at: 350 })], { impression: 3 }),
  ]);
  const h2 = heat(2, [
    res("d", 1, [
      att(1, { kind: "kiteloop", score: 6, counted: true, side: "right", at: 50 }),
      att(2, { kind: "backroll", score: 5, counted: true, side: "right", at: 150 }),
      att(3, { kind: "jump", score: 4, counted: true, side: "right", at: 250 }),
    ], { impression: 5 }),
    res("e", 2, [att(1, { kind: "backroll", score: 3, counted: true, at: 400 })], { impression: 3 }),
    res("f", 3, [att(1, { kind: "jump", status: "crashed", at: 100 })], { impression: 2 }),
  ]);
  const h3 = heat(3, [
    res("d", 1, [
      att(1, { kind: "kiteloop", score: 7, counted: true, side: "right", at: 100 }),
      att(2, { kind: "backroll", score: 6.5, counted: true, side: "right", at: 200 }),
      att(3, { kind: "frontroll", score: 6, counted: true, side: "right", at: 300 }),
    ], { impression: 5 }),
    res("a", 2, [
      att(1, { kind: "kiteloop", score: 6.5, counted: true, at: 100 }),
      att(2, { kind: "backroll2BoardOff", score: 5.5, counted: true, at: 200 }),
      att(3, { kind: "frontroll", status: "crashed", at: 300 }),
      att(4, { kind: "kiteloop", score: 4.5, counted: true, at: 400 }),
    ], { impression: 6 }),
  ]);
  return ctxOf(
    [round("R1", "Round 1", 1, [h1, h2], R1_ADVANCE), round("R2", "Final", 2, [h3], FINAL_ADVANCE)],
    {
      entries: ENTRIES,
      placings: {
        d: { place: 1, shared: false, round: "R2" },
        a: { place: 2, shared: false, round: "R2" },
        b: { place: 3, shared: true, round: "R1" },
        c: { place: 3, shared: true, round: "R1" },
        e: { place: 3, shared: true, round: "R1" },
        f: { place: 3, shared: true, round: "R1" },
      },
    },
  );
}
