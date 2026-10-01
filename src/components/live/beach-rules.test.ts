import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// CLAUDE.md golden rules 7 and 8 for the official phone screens (docs/06 §00): sizes come from the beach tokens, never from fixed Tailwind sizes, and
// every sentence a person reads comes from ui-copy.ts, never from a component.
const DIRS = ["src/components/live", "src/app/spot", "src/app/judge", "src/app/head"];
const files = DIRS.flatMap((d) => walk(d)).filter((f) => /\.tsx$/.test(f));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

describe("live screens follow the beach readability standard", () => {
  it("found the screens to check", () => expect(files.length).toBeGreaterThan(15));

  it.each(files)("%s: no fixed small text sizes and no tap target below the tap size", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src.match(/\btext-(xs|sm|\[\d+px\])\b/g) ?? [], "text sizes come from the beach tokens (text-small, text-body, …)").toEqual([]);
    expect(src.match(/\b(min-)?h-(?:[1-9]|10)\b(?![\w.-])/g) ?? [], "heights under 44 px are not tap targets (min-h-tap, min-h-pad)").toEqual([]);
  });

  it.each(files)("%s: no sentence written inside the component", (f) => {
    const src = readFileSync(f, "utf8");
    // JSX text of two or more words that starts with a capital letter: it belongs in ui-copy.ts
    const literals = [...src.matchAll(/>\s*([A-Z][a-z]+(?:\s+[a-z][\w’'.,!?-]*)+)\s*</g)].map((m) => m[1]);
    expect(literals).toEqual([]);
  });
});
