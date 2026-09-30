// Doc 08 §2G00 — single_final: one heat with everybody, that heat is the result.
import { describe, expect, it } from "vitest";
import { expandFormat } from "./expand";
import { heatSizes, loadFormat, makeEntrants, publishAll } from "./fixtures";
import { minHeatsPerRider } from "./minimum";
import { divisionPlacings } from "./placings";

const single = () => loadFormat("single-final");

describe("2G00 single final", () => {
  it("N = 1 … 10: one round, one heat of everybody, every rider placed 1..N", () => {
    for (let n = 1; n <= 10; n++) {
      const d = expandFormat(single(), makeEntrants(n));
      expect(d.rounds.map((r) => r.id), `N=${n}`).toEqual(["F"]);
      expect(heatSizes(d, "F"), `N=${n}`).toEqual([n]);
      expect(d.rounds[0].heats[0].bye, `N=${n}`).toBe(false);
      expect(d.warnings.filter((w) => w.type === "heat_size_limits"), `N=${n}`).toEqual([]);
      expect(divisionPlacings(publishAll(d)).map((p) => p.place), `N=${n}`).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });

  it("riders can be out after 1 heat: everyone rides exactly one heat", () => {
    expect(minHeatsPerRider(expandFormat(single(), makeEntrants(8)))).toBe(1);
  });

  it("more than 10 riders cannot ride one heat: the draw says so instead of hiding it", () => {
    const d = expandFormat(single(), makeEntrants(12));
    expect(heatSizes(d, "F")).toEqual([12]);
    expect(d.warnings.some((w) => w.type === "above_template_max")).toBe(true);
    expect(d.warnings.some((w) => w.type === "heat_size_limits")).toBe(true);
  });

  it("the heat length comes from the template", () => {
    expect(expandFormat(single(), makeEntrants(6)).rounds[0].heats[0].durationMin).toBe(15);
  });
});
