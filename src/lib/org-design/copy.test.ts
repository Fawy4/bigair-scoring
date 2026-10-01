import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { orgCopy } from "./copy";
import { ADVANCED_SETTINGS } from "./fixtures";

// The house words (ui-copy.test.ts) plus the words the Phase 7a plan adds to the banned list for the organiser screens.
const BANNED = /\b(chips?|vests?|marks?|marked|marking|byes?|repechage|dingle|man-on-man|configure[sd]?|configuring|configuration|entity|entities|records?|recorded|RPC)\b/i;

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") {
    try {
      const r = (value as (...a: unknown[]) => unknown)("x", "x", "x");
      if (typeof r === "string") out.push(r);
    } catch {
      /* not a text function */
    }
  } else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

describe("organiser preview wording", () => {
  it("has no banned word anywhere in the copy", () => {
    const all = strings(orgCopy);
    expect(all.length).toBeGreaterThan(80);
    expect(all.filter((t) => BANNED.test(t))).toEqual([]);
  });
  it("uses the plain words of the plan for the state pills", () => {
    expect(orgCopy.states.done.label).toBe("Done");
    expect(orgCopy.states.attention.label).toBe("Needs attention");
    expect(orgCopy.states.not_started.label).toBe("Not started");
  });
});

describe("tokens only (docs/PLAN-phase-7a.md rule 3: no new hex value appears in a component)", () => {
  // The QR code is the one fixed black on white (it must scan in the dark theme too); it lives in a .ts file, not in a component.
  // logo-field.tsx is an existing console component; it moves to the new look in 7a-1.
  const OLD = ["logo-field.tsx"];
  const files = [...walk("src/components/org"), ...walk("src/app/design/organiser")].filter((f) => /\.tsx$/.test(f) && !OLD.some((o) => f.endsWith(o)));
  it("finds the new components", () => expect(files.length).toBeGreaterThan(8));
  it("no component or page writes a hex colour, a 2 px black border or an extra-bold heading", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const code = readFileSync(f, "utf8");
      if (/#[0-9a-fA-F]{3,8}\b/.test(code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))) offenders.push(`${f}: hex colour`);
      if (/border-2|font-extrabold|text-3xl/.test(code)) offenders.push(`${f}: old console style`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("the Advanced fold", () => {
  it("has 10 settings and each one has a label, a line of explanation and an example sentence (a “?” never opens nothing)", () => {
    expect(ADVANCED_SETTINGS).toHaveLength(10);
    for (const s of ADVANCED_SETTINGS) {
      const text = orgCopy.settings.advanced[s.id];
      expect(text.label.length).toBeGreaterThan(3);
      expect(text.explanation.length).toBeGreaterThan(10);
      expect(text.example.length).toBeGreaterThan(10);
    }
  });
  it("the Simple dials each have a label, an explanation and an example too", () => {
    for (const d of Object.values(orgCopy.settings.dials)) {
      expect(d.label && d.explanation && d.example).toBeTruthy();
    }
  });
});
