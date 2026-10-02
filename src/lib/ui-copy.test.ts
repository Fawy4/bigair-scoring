import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import identification from "../../presets/identification/schemes.json";
import { copy, FORMAT_LABELS, help, orgCopy, SCORING_LABELS } from "./ui-copy";

// House words (owner's wording rules): never "chip", "vest" or "mark(s)" (use "Rider label", "Lycra", "score") and no bracket jargon:
// "bye" (use "Advances without riding"), "repechage" (use "Second-chance round"), "dingle elimination", "man-on-man" (use "1 v 1 heats"),
// "winners/losers bracket" (use "Main draw" / "Second-chance draw").
// Phase 7a adds the jargon words: "configure" in any form, "entity", "record" in any form (a noun or "recorded") and "RPC".
const BANNED = /\b(chips?|vests?|marks?|marked|marking|byes?|repechage|dingle|man-on-man|(winners?|losers?)['’]?\s+bracket|configure[sd]?|configuring|configuration|entity|entities|records?|recorded|RPC)\b/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** Text a user could read in a component: JSX text and string literals that look like sentences or single words. */
function userFacingText(source: string): string[] {
  let code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  // TypeScript generics (Record<string, string>) are types, not words on a screen: drop them before looking for JSX text, innermost first.
  for (let before = ""; before !== code; ) {
    before = code;
    code = code.replace(/\b(?:Record|Array|ReadonlyArray|Partial|Promise|Set|Map|Omit|Pick)<[^<>]*>/g, " ");
  }
  const found: string[] = [];
  for (const m of code.matchAll(/>([^<>{}=]+)</g)) found.push(m[1]);
  for (const m of code.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    const text = m[1] ?? m[2] ?? m[3] ?? "";
    // identifiers and ids (vest_colour, rider-chip, kites-no-vests) are data, not words on a screen
    if (/\s/.test(text) || /^[A-Z]/.test(text)) found.push(text);
  }
  return found.map((t) => t.trim()).filter(Boolean);
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") {
    // template functions: call with sample arguments so their wording is checked too
    try {
      const r = (value as (...a: unknown[]) => unknown)("x", "x", "x", "x");
      if (typeof r === "string") out.push(r);
    } catch {
      /* not a text function */
    }
  } else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

describe("house words in everything a user reads", () => {
  it("the copy file has no banned words", () => {
    const all = [...strings(copy), ...strings(orgCopy), ...strings(help), ...strings(SCORING_LABELS), ...strings(FORMAT_LABELS)];
    expect(all.length).toBeGreaterThan(400);
    expect(all.filter((t) => BANNED.test(t))).toEqual([]);
  });

  it("no component or page contains 'chip', 'vest' or 'marks' in text a user can read", () => {
    const files = walk("src").filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f));
    expect(files.length).toBeGreaterThan(20);
    const offenders: string[] = [];
    for (const file of files) {
      for (const text of userFacingText(readFileSync(file, "utf8"))) if (BANNED.test(text)) offenders.push(`${file}: ${text.slice(0, 80)}`);
    }
    expect(offenders).toEqual([]);
  });

  it("no source file has the words in visible strings (schemas, helpers, actions)", () => {
    const files = walk("src").filter((f) => /\.ts$/.test(f) && !/\.test\./.test(f) && !f.includes("src/lib/engine") && !f.endsWith("database.types.ts"));
    const offenders: string[] = [];
    for (const file of files) {
      for (const text of userFacingText(readFileSync(file, "utf8"))) if (BANNED.test(text)) offenders.push(`${file}: ${text.slice(0, 80)}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the TypeScript type Record<…> is not a user string", () => {
    expect(userFacingText("const roles = { a: 'Judge' } as Record<string, string>;\nconst x: Record<string, number> = {};").filter((t) => BANNED.test(t))).toEqual([]);
    expect(BANNED.test("Nothing recorded yet.")).toBe(true);
    expect(BANNED.test("Scores stay in the record")).toBe(true);
    expect(BANNED.test("Server configuration")).toBe(true);
  });

  it("the built-in identification schemes use 'lycra' wording", () => {
    const text = identification.schemes.flatMap((s) => [s.name, s.description]);
    expect(text.filter((t) => BANNED.test(t))).toEqual([]);
    expect(identification.schemes.find((s) => s.id === "vests-per-heat")?.name).toBe("Lycra colour per heat");
    expect(identification.schemes.find((s) => s.id === "fixed-lycra-per-rider")?.name).toBe("One lycra per rider for the event");
    expect(identification.schemes[0].id).toBe("name-callout");
  });

  it("the built-in scoring and format presets use 'score' wording", () => {
    const dirs = ["presets/scoring", "presets/formats"];
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const f of readdirSync(dir)) {
        const json = JSON.parse(readFileSync(join(dir, f), "utf8"));
        const visit = (v: unknown, key: string) => {
          if (typeof v === "string" && ["name", "description", "label", "help", "examples"].includes(key) && BANNED.test(v)) offenders.push(`${f}.${key}: ${v.slice(0, 60)}`);
          else if (Array.isArray(v)) v.forEach((x) => visit(x, key));
          else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) visit(x, k);
        };
        visit(json, "");
      }
    }
    expect(offenders).toEqual([]);
  });
});
