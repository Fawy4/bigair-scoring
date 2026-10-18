// Every trick of the judges' list (WoS_tricks_judges2026), with every variation, in any order of taps and in any of its words, gets exactly the reference the list gives.
// The expected numbers are written here from the sheet, not read from the preset, so a wrong value or a lost block in the preset fails.
import { describe, expect, it } from "vitest";
import vocabularyJson from "../../../../presets/tricks/big-air-vocabulary.json";
import { parseTyped } from "@/lib/live/spotter-sheet";
import { parseReferenceTable } from "@/lib/schemas/reference-scores";
import { buildTrickVocab, composeTrick, parseTrickText, referenceScore, type TrickParts, type TrickVocab, type VocabularyInput } from ".";

const json = vocabularyJson as unknown as VocabularyInput & { reference?: unknown };
const vocab = buildTrickVocab(json);
const table = parseReferenceTable(json.reference)!;
const idOf = (v: TrickVocab, key: string) => {
  const b = v.blocks.find((x) => x.key === key);
  if (!b) throw new Error(`no block ${key}`);
  return b.id;
};

/** The sheet: the trick, the blocks it is made of, and its value. */
/** `exact` false: the same trick can be tapped in two ways (Late + Backroll is the Late backroll), so typed words may be read as the other way; the number is the same. */
const SHEET: Array<[string, string[], number, boolean?]> = [
  ["Kiteloop (L)", ["kiteloop"], 2],
  ["Grabbed (LG)", ["kiteloop", "grab"], 2.5],
  ["Back Rotation(s) (LB)", ["backroll", "kiteloop_mod"], 3, false],
  ["Back Rotation(s) with the base Kiteloop", ["backroll", "kiteloop"], 3, false],
  ["Loop back rot invert (LBI)", ["loop_back_rot_invert"], 3.5],
  ["Boogie (BO)", ["boogie_loop"], 4],
  ["Doobie (DO)", ["doobie_loop"], 5.5],
  ["Late Backroll (LLB)", ["late_backroll"], 4.2],
  ["Late Backroll as Late + Backroll", ["late", "backroll"], 4.2, false],
  ["Late Frontroll (LLF)", ["late_frontroll"], 4.5],
  ["Late Frontroll as Late + Frontroll", ["late", "frontroll"], 4.5, false],
  ["S-loop (SL)", ["s_loop"], 4],
  ["KGB (LKG)", ["kgb"], 7.5],
  ["Doubleloop (DL)", ["double_loop"], 5],
  ["Snakeloop (SnL)", ["snakeloop"], 6],
  ["Straight Dangle Pass (DP)", ["straight_dangle_pass"], 5],
  ["Double Dangle Pass (DDP)", ["double_dangle_pass"], 6.5],
  ["36 Kung-Fu HP (36HP)", ["kung_fu_36_hp"], 6],
  ["36 Kung-Fu 2 HP (362HP)", ["kung_fu_36_2_hp"], 7.5],
  ["KL3", ["kl3"], 7],
];
/** The variations: the board ones do not stack (the highest counts); Unhook and a blind landing stack. */
const VARIATIONS: Array<[string, string, number, "board" | "other"]> = [
  ["Board Off", "board_off", 2, "board"],
  ["Board spin", "board_spin", 2.2, "board"],
  ["Board Flip", "board_flip", 2.5, "board"],
  ["Osmosis", "osmosis", 2.7, "board"],
  ["Unhook", "unhook", 1.5, "other"],
  ["To Blind", "blind_landing", 0.5, "other"],
];
const round = (n: number) => Math.round(n * 100) / 100;
const subsets = <T,>(list: T[]): T[][] => list.reduce<T[][]>((all, x) => [...all, ...all.map((s) => [...s, x])], [[]]);
const expected = (base: number, chosen: typeof VARIATIONS) => round(base + Math.max(0, ...chosen.filter((v) => v[3] === "board").map((v) => v[2])) + chosen.filter((v) => v[3] === "other").reduce((s, v) => s + v[2], 0));

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffled = <T,>(list: T[], next: () => number): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const permutations = <T,>(list: T[]): T[][] => (list.length <= 1 ? [list] : list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((p) => [x, ...p])));

const cases = SHEET.flatMap(([name, keys, base, exact]) => subsets(VARIATIONS).map((chosen) => ({ name, keys, chosen, exact: exact !== false, blocks: [...keys, ...chosen.map((v) => v[1])], value: expected(base, chosen) })));

describe("the list's tricks, every variation, any order of taps", () => {
  it("covers every trick of the sheet (and the other way to tap three of them) × 64 combinations of variations", () => expect(cases.length).toBe(SHEET.length * 64));

  it("every combination gets its number, whatever order the blocks were tapped in", () => {
    const next = rng(7);
    let checked = 0;
    for (const c of cases) {
      const orders = c.blocks.length <= 4 ? permutations(c.blocks) : Array.from({ length: 30 }, () => shuffled(c.blocks, next));
      for (const order of orders) {
        const parts: TrickParts = { direction: next() < 0.5 ? "left" : "right", items: order.map((k) => ({ id: idOf(vocab, k) })) };
        const r = referenceScore(vocab, table, parts);
        expect(r?.value, `${c.name} + ${c.chosen.map((v) => v[0]).join(", ") || "nothing"} tapped as ${order.join(" → ")}`).toBe(c.value);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20000);
  });

  it("a multiplier changes nothing, and the number is the same with a direction or without", () => {
    for (const c of cases.filter((_, i) => i % 7 === 0)) {
      const items = c.blocks.map((k, i) => ({ id: idOf(vocab, k), ...(i === 0 ? { multiplier: "x2" } : {}) }));
      expect(referenceScore(vocab, table, { direction: null, items })?.value, c.name).toBe(c.value);
    }
  });
});

describe("the same tricks typed or spoken: every name, every alias, any order", () => {
  // a word that two blocks share cannot tell them apart (Kiteloop and + Kiteloop are both "KL"): it is not typed here
  const words = (key: string): string[] => {
    const b = vocab.blocks.find((x) => x.key === key)!;
    const all = [b.label, ...b.aliases];
    const plain = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); // the reader ignores signs and hyphens: “+ Kiteloop” is the word “kiteloop”
    const taken = (w: string) => vocab.blocks.filter((o) => o.id !== b.id && [o.label, ...o.aliases].some((x) => plain(x) === plain(w))).length > 0;
    return all.filter((w) => !taken(w));
  };

  it("every block of the list has at least one word of its own", () => {
    for (const k of new Set([...SHEET.flatMap((s) => s[1]), ...VARIATIONS.map((v) => v[1])])) expect(words(k).length, k).toBeGreaterThan(0);
  });

  it("every word of every block on the list, typed alone the way the spotter's box reads it, is that block", () => {
    const everyBlock = new Set(vocab.blocks.map((b) => b.id));
    const keys = new Set([...SHEET.flatMap((s) => s[1]), ...VARIATIONS.map((v) => v[1])]);
    for (const k of keys) {
      for (const w of words(k)) {
        const { count, parsed } = parseTyped(vocab, everyBlock, w);
        expect(count, `“${w}” (${k}) is not a count`).toBeNull();
        expect(parsed.parts.items.map((i) => i.id), `“${w}” (${k})`).toEqual([idOf(vocab, k)]);
      }
    }
  });

  it("typed in any order, with any of its words, the trick is read as exactly those blocks and gets its number", () => {
    const next = rng(11);
    const everyBlock = vocab.blocks.map((b) => b.id);
    let checked = 0;
    // Late + Backroll typed as separate words is the Late backroll's own name ("late back roll" is read by the trick base's own rule about nicknames, not here)
    const typedCases = cases.filter((c) => !c.name.includes("as Late +"));
    for (const c of typedCases) {
      for (let round_ = 0; round_ < 6; round_++) {
        const order = shuffled(c.blocks, next);
        const typed = order.map((k) => {
          const w = words(k);
          return w[Math.floor(next() * w.length)];
        });
        const side = next() < 0.5 ? (next() < 0.5 ? "Left " : "right ") : "";
        const text = side + typed.join(next() < 0.5 ? " " : ", ");
        const read = parseTrickText(vocab, text, everyBlock);
        const label = `“${text}” for ${c.name}`;
        expect(read.parts.freeText?.trim() ?? "", label).toBe("");
        expect(read.needsReview, label).toBe(false);
        if (c.exact) expect([...read.parts.items.map((i) => i.id)].sort(), label).toEqual(c.blocks.map((k) => idOf(vocab, k)).sort());
        expect(referenceScore(vocab, table, read.parts)?.value, label).toBe(c.value);
        checked++;
      }
    }
    expect(checked).toBe(typedCases.length * 6);
  });

  it("a trick's name as the spotter's list writes it (what a head judge's edit keeps) reads back to the same trick and number", () => {
    const next = rng(13);
    const everyBlock = vocab.blocks.map((b) => b.id);
    for (const c of cases) {
      for (let i = 0; i < 3; i++) {
        const order = shuffled(c.blocks, next);
        const parts: TrickParts = { direction: i === 0 ? null : "left", items: order.map((k) => ({ id: idOf(vocab, k) })) };
        const name = composeTrick(vocab, parts).name;
        const read = parseTrickText(vocab, name, everyBlock);
        expect(read.parts.freeText?.trim() ?? "", name).toBe("");
        expect(referenceScore(vocab, table, read.parts)?.value, name).toBe(c.value);
      }
    }
  });
});

describe("a trick base as the owner has edited it", () => {
  // the live one: Doobie renamed (key doobie_loop, words doobie / dooby / doo) and the event's own retired copy, key local_doobie, with the same name
  const live = (): TrickVocab => {
    const j = JSON.parse(JSON.stringify(json)) as VocabularyInput & { reference?: unknown };
    const d = j.baseTricks.find((b) => b.key === "doobie_loop")!;
    d.label = "Doobie";
    d.aliases = ["doobie", "dooby", "doo"];
    return buildTrickVocab(j, [{ family: "base", key: "local_doobie", label: "Doobie", category: "kiteloop" }]);
  };

  it("the copy the event made of the trick is the same trick: it keeps the hint", () => {
    const v = live();
    const copy = idOf(v, "local_doobie");
    expect(referenceScore(v, table, { direction: "left", items: [{ id: copy }] })?.value).toBe(5.5);
    expect(referenceScore(v, table, { direction: "left", items: [{ id: copy }, { id: idOf(v, "board_off") }] })?.value).toBe(7.5);
    expect(referenceScore(v, table, { direction: null, items: [{ id: idOf(v, "board_off") }, { id: copy }, { id: idOf(v, "blind_landing") }] })?.value).toBe(8);
  });

  it("the renamed trick is named as the list names it now, and the owner's words are untouched", () => {
    const v = live();
    expect(referenceScore(v, table, { direction: null, items: [{ id: idOf(v, "doobie_loop") }] })?.parts[0].label).toBe("Doobie");
    const doobie = v.blocks.find((b) => b.key === "doobie_loop")!;
    expect(doobie.aliases).toEqual(["doobie", "dooby", "doo"]);
  });

  it("typing the owner's own words for it finds the trick", () => {
    const v = live();
    const every = v.blocks.map((b) => b.id);
    for (const w of ["doobie", "dooby", "doo", "Doobie"]) {
      const read = parseTrickText(v, `${w} board off`, every);
      expect(read.parts.freeText?.trim() ?? "", w).toBe("");
      expect(referenceScore(v, table, read.parts)?.value, w).toBe(7.5);
    }
  });

  it("two different blocks that merely share a word are not taken for each other", () => {
    // Kiteloop and + Kiteloop both answer to "KL": a logged "+ Kiteloop" must not become the Kiteloop trick
    const v = buildTrickVocab(json);
    expect(referenceScore(v, table, { direction: null, items: [{ id: idOf(v, "kiteloop_mod") }] })).toBeNull();
  });
});
