import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { excludeSimulations } from "./exclude-simulations";

describe("exports leave simulation events out (docs/PLAN-phase-5 step 4, owner decision 11)", () => {
  it("drops events flagged as a simulation, in either spelling, and keeps the rest in order", () => {
    const rows = [{ id: 1, is_simulation: false }, { id: 2, is_simulation: true }, { id: 3 }, { id: 4, isSimulation: true }, { id: 5, is_simulation: null }];
    expect(excludeSimulations(rows).map((r) => r.id)).toEqual([1, 3, 5]);
  });

  it("every file of an export module (src/lib/exports, except this helper) uses excludeSimulations, so a later phase cannot forget it", () => {
    const dir = join(process.cwd(), "src", "lib", "exports");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "exclude-simulations.ts" && statSync(join(dir, f)).isFile());
    for (const f of files) expect(readFileSync(join(dir, f), "utf8"), `${f} must call excludeSimulations`).toContain("excludeSimulations(");
  });
});
