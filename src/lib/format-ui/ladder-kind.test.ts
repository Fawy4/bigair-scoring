import { describe, expect, it } from "vitest";
import dingle from "../../../presets/formats/kota-dingle.json";
import megaloop from "../../../presets/formats/megaloop-men-16.json";
import single from "../../../presets/formats/heats4-top2-single-elim.json";
import { FormatTemplateSchema, parseFormatTemplate } from "@/lib/schemas/format-template";
import { copy } from "@/lib/ui-copy";
import { ladderKindOf, withLadderKind, withoutRoundLengths, withRoundLength } from "./ladder-kind";
import { previewFormat } from "./preview";

describe("ladder type choice", () => {
  it("recognises the three generated types and a custom ladder", () => {
    expect(ladderKindOf(parseFormatTemplate(single))).toBe("knockout");
    expect(ladderKindOf(parseFormatTemplate(dingle))).toBe("second_chance");
    expect(ladderKindOf(parseFormatTemplate(megaloop))).toBe("custom");
    expect(ladderKindOf(null)).toBe("custom");
  });

  it("each choice maps to its generator and stays a valid format", () => {
    const base = parseFormatTemplate(single) as unknown as Record<string, unknown>;
    for (const [kind, generator] of [["knockout", "single_elimination"], ["second_chance", "dingle_elimination"], ["pools", "pools_to_final"]] as const) {
      const next = withLadderKind(base, kind);
      expect((next.generator as { type: string }).type).toBe(generator);
      expect(FormatTemplateSchema.safeParse(next).success, kind).toBe(true);
      expect(previewFormat(parseFormatTemplate(next), 14).ok, kind).toBe(true);
    }
  });

  it("replacing a fixed ladder drops its own rounds and keeps the timing", () => {
    const fixed = parseFormatTemplate(megaloop) as unknown as Record<string, unknown>;
    const next = withLadderKind(fixed, "knockout");
    expect(next.rounds).toBeUndefined();
    expect(next.kind).toBe("generator");
    expect(next.timing).toEqual(fixed.timing);
  });

  it("the three explanations are the ones the owner asked for", () => {
    const t = copy.formatSimple.types;
    expect(t.knockout.explain).toBe("Top riders from each heat advance to the next round; the rest are out.");
    expect(t.knockout.example).toBe("Example: heats of 4, top 2 go through.");
    expect(t.second_chance.title).toBe("Knockout with a second chance");
    expect(t.second_chance.explain).toBe("Heat winners advance directly; 2nd and 3rd get one more heat to qualify.");
    expect(t.second_chance.example).toBe("Example: King of the Air Round 1 → Round 2.");
    expect(t.pools.explain).toBe("Everyone rides once; all heat scores are ranked together and the top N ride the final.");
    expect(t.pools.example).toBe("Example: 23 riders in 3 pools, best 6 to the final.");
  });

  describe("heat length per round", () => {
    const knock = () => parseFormatTemplate(single) as unknown as Record<string, unknown>;

    it("pre-filled from the single setting: a row equal to the default stores nothing", () => {
      expect(withRoundLength(knock(), "R1", 10, 10).roundDurationMin).toBeUndefined();
    });

    it("a different value is stored for that round only; clearing or matching the default removes it again", () => {
      const a = withRoundLength(knock(), "R1", 9, 10);
      const b = withRoundLength(a, "F", 20, 15);
      expect(b.roundDurationMin).toEqual({ R1: 9, F: 20 });
      expect(withRoundLength(b, "R1", "", 10).roundDurationMin).toEqual({ F: 20 });
      expect(withRoundLength(withRoundLength(b, "R1", 10, 10), "F", 15, 15).roundDurationMin).toBeUndefined();
      expect(withoutRoundLengths(b).roundDurationMin).toBeUndefined();
    });

    it("the text preview, the diagram and the totals follow the override (breaks do not)", () => {
      const plain = previewFormat(parseFormatTemplate(knock()), 14);
      const custom = previewFormat(parseFormatTemplate(withRoundLength(withRoundLength(knock(), "R1", 9, 10), "F", 20, 15)), 14);
      expect(plain.ladder[0].summary).toBe("4 heats · 3–4 riders · 10 min");
      expect(custom.ladder.map((c) => c.summary)).toEqual(["4 heats · 3–4 riders · 9 min", "2 heats · 4 riders · 12 min", "1 heat · 4 riders · 20 min"]);
      expect(custom.rounds.map((r) => r.heatMin)).toEqual(["9", "12", "20"]);
      expect(custom.ridingMinutes).toBe(plain.ridingMinutes - 4 * 1 + 5); // R1: 4 heats × 1 min less, F: 1 heat × 5 min more
      expect(custom.sentence).toBe(plain.sentence); // same shape, only lengths differ
    });

    it("switching the ladder type clears per-round lengths (round ids differ between ladder types)", () => {
      const pools = withLadderKind(withRoundLength(knock(), "SF", 30, 12), "pools");
      expect(pools.roundDurationMin).toBeUndefined();
      expect(previewFormat(parseFormatTemplate(pools), 23).ok).toBe(true);
    });
  });
});
