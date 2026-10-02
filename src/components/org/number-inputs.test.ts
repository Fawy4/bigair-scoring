import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

// docs/PLAN-phase-7a.md step 8b: every number box on the organiser and admin screens is a NumberField (as wide as its largest number, digits at the right).
// Left alone on purpose: the official practice panel (its own sizes) and the preview's "today's look" box that exists for comparison.
const ALLOWED = ["src/components/org/number-field.tsx", "src/components/live/practice-panel.tsx", "src/app/design/organiser/sections.tsx"];

describe("number boxes", () => {
  it("no screen draws its own type=number input", () => {
    const offenders = walk("src")
      .filter((f) => /\.tsx$/.test(f) && !ALLOWED.some((a) => f.endsWith(a)))
      .filter((f) => /type="number"/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("the NumberField right-aligns by default and never takes the width of its container", () => {
    const code = readFileSync("src/components/org/number-field.tsx", "utf8");
    expect(code).toMatch(/align = "end"/);
    expect(code).toMatch(/numberFieldWidth/);
  });
});
