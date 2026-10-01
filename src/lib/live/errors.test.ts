import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copy } from "@/lib/ui-copy";
import { errorSentence, parseError } from "./errors";

describe("error sentences (docs/08 §1G-12)", () => {
  it("reads the code and the detail", () => {
    expect(parseError("DRAW_NOT_LOCKED: Pro Men")).toEqual({ code: "DRAW_NOT_LOCKED", detail: "Pro Men" });
    expect(parseError("NOT_ALLOWED")).toEqual({ code: "NOT_ALLOWED" });
    expect(parseError("new row violates row-level security policy")).toEqual({ code: null });
  });
  it("Start refused: the draw is not locked, in the owner's words", () => {
    expect(errorSentence("DRAW_NOT_LOCKED: Pro Men")).toBe("Draw for Pro Men is not locked — lock it in the Draw step");
  });
  it("names the panel, how many there are and how many it needs", () => {
    expect(errorSentence("PANEL_TOO_SMALL: Pro Men|2|3")).toBe("Pro Men needs 3 judges on its panel and has 2 — add judges in the Officials step");
  });
  it("knows a network failure and an unknown one", () => {
    expect(errorSentence("TypeError: Failed to fetch")).toBe(copy.liveErrors.network);
    expect(errorSentence("something odd")).toBe(copy.liveErrors.unknown);
  });
  it("every code the live migration and the attempt functions can raise has a sentence", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).filter((f) => /phase5b|fix_seatless/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(2);
    const codes = new Set<string>();
    for (const f of files) for (const m of readFileSync(join(dir, f), "utf8").matchAll(/raise exception '([A-Z][A-Z0-9_]+)/g)) codes.add(m[1]);
    // not shown on the live screens: the organiser's step handles these, or they are internal
    const quiet = new Set(["TRICK_BASE_INVALID", "TRICK_BASE_LOCKED"]);
    const missing = [...codes].filter((c) => !quiet.has(c) && !copy.liveErrors.codes[c]);
    expect(missing).toEqual([]);
  });
});
