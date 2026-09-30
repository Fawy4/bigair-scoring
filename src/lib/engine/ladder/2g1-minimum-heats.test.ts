// "Minimum heats per rider: N" — the fewest heats any rider is guaranteed to ride, whatever the results.
import { describe, expect, it } from "vitest";
import { expandFormat } from "./expand";
import { loadFormat, makeEntrants } from "./fixtures";
import { minHeatsPerRider } from "./minimum";

const minimum = (name: string, n: number, patch?: (j: never) => void) => minHeatsPerRider(expandFormat(loadFormat(name, patch as never), makeEntrants(n)));

describe("minimum heats per rider", () => {
  it("knockout: a rider can be out after 1 heat", () => {
    expect(minimum("heats4-top2-single-elim", 14)).toBe(1);
    expect(minimum("heats4-top2-single-elim", 24)).toBe(1);
  });

  it("pools to a final: everyone rides once, the rest are out", () => {
    expect(minimum("pools-to-final", 23)).toBe(1);
  });

  it("knockout with a second chance: every rider rides at least 2 heats", () => {
    for (const n of [9, 10, 12, 14, 18, 20, 24, 30, 36]) expect(minimum("kota-dingle", n), `N = ${n}`).toBeGreaterThanOrEqual(2);
  });

  it("a single heat with everyone is one heat", () => {
    expect(minimum("heats4-top2-single-elim", 5)).toBe(1);
  });

  it("two pool rounds: everyone rides both before the cut", () => {
    expect(minimum("pools-to-final", 23, ((j: { generator: { params: Record<string, unknown> } }) => Object.assign(j.generator.params, { poolRounds: 2 })) as never)).toBe(2);
  });
});
