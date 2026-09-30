import { describe, expect, it } from "vitest";
import { expandFormat } from "@/lib/engine/ladder/expand";
import { FormatTemplateSchema, parseFormatTemplate } from "@/lib/schemas/format-template";
import single from "../../../presets/formats/heats4-top2-single-elim.json";
import dingle from "../../../presets/formats/kota-dingle.json";
import { withHeatName, withRoundName } from "./ladder-kind";
import { previewFormat } from "./preview";
import { diffOverrides, FORMAT_NULLABLE, mergeOverrides } from "@/lib/scoring-ui/overrides";

const base = () => parseFormatTemplate(single) as unknown as Record<string, unknown>;
const riders = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, name: `Rider ${i + 1}` }));

describe("round and heat names", () => {
  it("clicking a name stores an override keyed by round or heat id; blank restores the default", () => {
    const a = withRoundName(base(), "SF", "Semi-finals (women)");
    expect(a.roundNames).toEqual({ SF: "Semi-finals (women)" });
    const b = withHeatName(a, "R1-H2", "Heat for the youngest");
    expect(b.heatNames).toEqual({ "R1-H2": "Heat for the youngest" });
    expect(withRoundName(b, "SF", "  ").roundNames).toBeUndefined();
    expect(withHeatName(b, "R1-H2", "").heatNames).toBeUndefined();
    expect(FormatTemplateSchema.safeParse(b).success).toBe(true);
  });

  it("names reach the draw (timetable and public pages read them there) and the diagram", () => {
    const t = parseFormatTemplate(withHeatName(withRoundName(base(), "SF", "Semi-finals (women)"), "R1-H2", "Youth heat") as never);
    const d = expandFormat(t, riders(14));
    expect(d.rounds.find((r) => r.id === "SF")!.name).toBe("Semi-finals (women)");
    expect(d.rounds.find((r) => r.id === "R1")!.name).toBe("Round 1"); // untouched
    expect(d.rounds[0].heats[1].name).toBe("Youth heat");
    expect(d.rounds[0].heats[0].name).toBeUndefined();
    const p = previewFormat(t, 14);
    expect(p.ladder.find((c) => c.id === "SF")).toMatchObject({ name: "Semi-finals (women)", defaultName: "Semi-finals" });
    expect(p.ladder[0].heats[1]).toMatchObject({ name: "Youth heat", defaultName: "R1 H2" });
  });

  it("names survive regeneration: another number of riders keeps the round names, and heat names where the heat still exists", () => {
    const t = parseFormatTemplate(withHeatName(withRoundName(base(), "F", "Grand final"), "R1-H2", "Youth heat") as never);
    for (const n of [8, 14, 24]) {
      const d = expandFormat(t, riders(n));
      expect(d.rounds.at(-1)!.name, `N=${n}`).toBe("Grand final");
      expect(d.rounds[0].heats[1].name, `N=${n}`).toBe("Youth heat");
    }
  });

  it("names work on every format type, including second chance", () => {
    const t = parseFormatTemplate(withRoundName(dingle as never, "R2", "Last chance") as never);
    expect(expandFormat(t, riders(14)).rounds.find((r) => r.id === "R2")!.name).toBe("Last chance");
  });

  it("names are stored as overrides of the division's format: only the names differ from the preset", () => {
    const preset = base();
    const working = withRoundName(preset, "SF", "Semi-finals (women)");
    const overrides = diffOverrides(preset, working, FORMAT_NULLABLE);
    expect(overrides).toEqual({ roundNames: { SF: "Semi-finals (women)" } });
    expect(mergeOverrides(preset, overrides, FORMAT_NULLABLE)).toEqual(working);
    // and blank again = no override at all
    const cleared = withRoundName(working, "SF", "");
    expect(diffOverrides(preset, cleared, FORMAT_NULLABLE)).toEqual({});
  });

  it("names are limited to 40 characters", () => {
    expect((withRoundName(base(), "SF", "x".repeat(60)).roundNames as Record<string, string>).SF).toHaveLength(40);
  });
});
