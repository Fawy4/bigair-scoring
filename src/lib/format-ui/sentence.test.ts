import { describe, expect, it } from "vitest";
import { expandFormat } from "@/lib/engine/ladder";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import { readFileSync } from "node:fs";
import { aboutHoursMinutes, formatSentence } from "./sentence";
import { previewFormat } from "./preview";

describe("about 2 h 40", () => {
  it("rounds to 5 minutes and writes plain words", () => {
    expect(aboutHoursMinutes(160)).toBe("2 h 40");
    expect(aboutHoursMinutes(121)).toBe("2 h");
    expect(aboutHoursMinutes(125)).toBe("2 h 05");
    expect(aboutHoursMinutes(45)).toBe("45 min");
    expect(aboutHoursMinutes(0)).toBe("5 min");
    expect(aboutHoursMinutes(60)).toBe("1 h");
  });
});

describe("the Format sentence", () => {
  it("names the ladder, the sizes, who advances and the time", () => {
    expect(formatSentence({ kindTitle: "Knockout", heatSize: 4, advance: 2, finalSize: 4, riders: 14, rounds: 4, totalMin: 160 })).toBe("Knockout, heats of 4, top 2 advance, final of 4 — 14 riders: 4 rounds, about 2 h 40");
  });
  it("leaves out what the ladder type does not use, and says 1 round / 1 rider in the singular", () => {
    expect(formatSentence({ kindTitle: "Single final", riders: 1, rounds: 1, totalMin: 10 })).toBe("Single final — 1 rider: 1 round, about 10 min");
    expect(formatSentence({ kindTitle: "Knockout with a second chance", heatSize: 3, finalSize: 4, riders: 12, rounds: 5, totalMin: 200 })).toBe("Knockout with a second chance, heats of 3, final of 4 — 12 riders: 5 rounds, about 3 h 20");
  });
  it("the preview of a real format carries its total minutes", () => {
    const json = JSON.parse(readFileSync("presets/formats/kota-dingle.json", "utf8"));
    const t = parseFormatTemplate(json);
    expandFormat(t, Array.from({ length: 18 }, (_, i) => ({ id: `r${i}`, name: `R${i}` })));
    const p = previewFormat(t, 18);
    expect(p.ok).toBe(true);
    expect(p.totalMinutes).toBeGreaterThan(60);
  });
});
