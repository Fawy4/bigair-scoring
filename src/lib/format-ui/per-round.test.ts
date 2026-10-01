// "Heat length per round" must list every round of the preview, pre-filled with the division's heat length (fix-run-order-duration, point 4).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import { previewFormat } from "./preview";
import { perRoundRows } from "./per-round";

const DIR = join(process.cwd(), "presets", "formats");
const presets = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => [f, JSON.parse(readFileSync(join(DIR, f), "utf8"))] as const);

describe("Pro Women: heats of 4, top 2 advance, 6 riders", () => {
  const template = parseFormatTemplate(presets.find(([f]) => f === "heats4-top2-single-elim.json")![1]);
  it("lists R1 and Final, each pre-filled with 10 minutes", () => {
    expect(perRoundRows(template, 6)).toEqual([
      { id: "R1", shortName: "R1", name: "Round 1", defaultMin: 10 },
      { id: "F", shortName: "F", name: "Final", defaultMin: 10 },
    ]);
  });
  it("an own length on one round does not change the pre-fill of the others or of itself", () => {
    const own = parseFormatTemplate({ ...presets.find(([f]) => f === "heats4-top2-single-elim.json")![1], roundDurationMin: { F: 20 } });
    expect(perRoundRows(own, 6).map((r) => [r.id, r.defaultMin])).toEqual([["R1", 10], ["F", 10]]);
  });
});

describe("every built-in format, 1 to 40 riders: the table lists exactly the preview's rounds that have heats, with a real pre-fill", () => {
  for (const [file, json] of presets) {
    it(file, () => {
      const template = parseFormatTemplate(json);
      for (let n = 1; n <= 40; n++) {
        const preview = previewFormat(template, n);
        const rows = perRoundRows(template, n);
        const expected = preview.rounds.filter((r) => r.heats > 0).map((r) => r.id);
        expect(rows.map((r) => r.id), `${file} with ${n} riders`).toEqual(expected);
        for (const r of rows) expect(Number.isFinite(r.defaultMin) && r.defaultMin > 0, `${file} ${n} riders ${r.id} pre-fill ${r.defaultMin}`).toBe(true);
        if (preview.ok) expect(rows.length, `${file} with ${n} riders lists no round at all`).toBeGreaterThan(0);
      }
    });
  }
});
