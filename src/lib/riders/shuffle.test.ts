import { describe, expect, it } from "vitest";
import { renumber, shuffleSeeded, sortBySeedNumber, type OrderRow } from "./shuffle";

const rows = (n: number): OrderRow[] => Array.from({ length: n }, (_, i) => ({ id: `id${String(i).padStart(2, "0")}`, name: `Rider ${String.fromCharCode(65 + i)}`, seed: i + 1 }));

describe("shuffleSeeded", () => {
  it("the same shuffle seed gives the same order every time", () => {
    const a = shuffleSeeded(rows(24), 48213).map((x) => x.id);
    const b = shuffleSeeded(rows(24), 48213).map((x) => x.id);
    expect(a).toEqual(b);
  });
  it("does not depend on the order the riders were in before", () => {
    const base = rows(24);
    const reversed = [...base].reverse();
    expect(shuffleSeeded(base, 7).map((x) => x.id)).toEqual(shuffleSeeded(reversed, 7).map((x) => x.id));
  });
  it("another seed gives another order", () => {
    expect(shuffleSeeded(rows(24), 1).map((x) => x.id)).not.toEqual(shuffleSeeded(rows(24), 2).map((x) => x.id));
  });
  it("keeps everybody exactly once and leaves the input alone", () => {
    const input = rows(24);
    const copy = JSON.stringify(input);
    const out = shuffleSeeded(input, 99);
    expect(out.map((x) => x.id).sort()).toEqual(input.map((x) => x.id).sort());
    expect(JSON.stringify(input)).toBe(copy);
  });
  it("copes with nobody and with one rider", () => {
    expect(shuffleSeeded([], 1)).toEqual([]);
    expect(shuffleSeeded(rows(1), 1)).toHaveLength(1);
  });
  it("really mixes: over many seeds every rider reaches every position", () => {
    const seen = Array.from({ length: 4 }, () => new Set<string>());
    for (let seed = 1; seed <= 200; seed++) shuffleSeeded(rows(4), seed).forEach((x, i) => seen[i].add(x.id));
    expect(seen.every((s) => s.size === 4)).toBe(true);
  });
});

describe("sortBySeedNumber and renumber", () => {
  it("sorts by the typed seed, empty seeds last, ties by current order", () => {
    const input: OrderRow[] = [
      { id: "a", name: "A", seed: 5 },
      { id: "b", name: "B", seed: null },
      { id: "c", name: "C", seed: 1 },
      { id: "d", name: "D", seed: 5 },
    ];
    expect(sortBySeedNumber(input).map((x) => x.id)).toEqual(["c", "a", "d", "b"]);
  });
  it("renumber gives 1..n in the order given", () => {
    expect(renumber(sortBySeedNumber([{ id: "a", name: "A", seed: 9 }, { id: "b", name: "B", seed: 2 }])).map((x) => [x.id, x.seed])).toEqual([["b", 1], ["a", 2]]);
  });
});
