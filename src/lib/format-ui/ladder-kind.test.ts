import { describe, expect, it } from "vitest";
import dingle from "../../../presets/formats/kota-dingle.json";
import megaloop from "../../../presets/formats/megaloop-men-16.json";
import single from "../../../presets/formats/heats4-top2-single-elim.json";
import { FormatTemplateSchema, parseFormatTemplate } from "@/lib/schemas/format-template";
import { copy } from "@/lib/ui-copy";
import { heatSizes, ladderKindOf, withHeatTarget, withLadderKind, withMaxRiders, withMinRiders, withoutRoundLengths, withRoundLength, withSecondChancePlaces } from "./ladder-kind";
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
    expect(t.second_chance.explain).toBe("Heat winners advance directly; the other riders get one more heat to qualify.");
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

  describe("riders per heat (target), minimum and maximum per heat", () => {
    const knock = () => parseFormatTemplate(single) as unknown as Record<string, unknown>;
    const second = () => parseFormatTemplate(dingle) as unknown as Record<string, unknown>;

    it("reads the target and the effective minimum (default: target − 1, never below 2)", () => {
      expect(heatSizes(knock())).toEqual({ target: 4, min: 3, max: 5, explicit: false, explicitMax: false });
      expect(heatSizes(second())).toEqual({ target: 3, min: 2, max: 4, explicit: false, explicitMax: false });
      expect(heatSizes(parseFormatTemplate(megaloop) as unknown as Record<string, unknown>)).toBeNull();
    });

    it("the minimum can be set equal to the target; the default is not stored", () => {
      const four = withMinRiders(knock(), 4);
      expect(heatSizes(four)).toEqual({ target: 4, min: 4, max: 5, explicit: true, explicitMax: false });
      expect(heatSizes(withMinRiders(four, 3))).toEqual({ target: 4, min: 3, max: 5, explicit: false, explicitMax: false }); // back to the default
      expect(heatSizes(withMinRiders(four, ""))).toMatchObject({ explicit: false });
    });

    it("a default minimum follows the target; a stored minimum is lowered when the target drops below it", () => {
      expect(heatSizes(withHeatTarget(knock(), 6))).toEqual({ target: 6, min: 5, max: 7, explicit: false, explicitMax: false });
      const four = withMinRiders(knock(), 4);
      expect(heatSizes(withHeatTarget(four, 3))).toEqual({ target: 3, min: 3, max: 4, explicit: true, explicitMax: false });
      expect(FormatTemplateSchema.safeParse(withHeatTarget(four, 3)).success).toBe(true);
    });

    it("the maximum can be set equal to the target (min = max = target); the default (target + 1) is not stored", () => {
      const exact = withMaxRiders(withMinRiders(knock(), 4), 4);
      expect(heatSizes(exact)).toEqual({ target: 4, min: 4, max: 4, explicit: true, explicitMax: true });
      expect(FormatTemplateSchema.safeParse(exact).success).toBe(true);
      expect(heatSizes(withMaxRiders(exact, 5))).toMatchObject({ max: 5, explicitMax: false });
      expect(heatSizes(withMaxRiders(exact, ""))).toMatchObject({ explicitMax: false });
    });

    it("a stored maximum is raised when the target goes above it", () => {
      const three = withMaxRiders(withHeatTarget(knock(), 3), 3);
      expect(heatSizes(withHeatTarget(three, 5))).toMatchObject({ target: 5, max: 5, explicitMax: true });
      expect(FormatTemplateSchema.safeParse(withHeatTarget(three, 5)).success).toBe(true);
    });

    it("who gets a second chance is a setting of the second-chance ladder only", () => {
      expect(withSecondChancePlaces(knock(), 2)).toEqual(knock()); // knockout: nothing changes
      const two = withSecondChancePlaces(second(), 2);
      expect((two.generator as { params: Record<string, unknown> }).params.secondChancePlaces).toBe(2);
      expect((withSecondChancePlaces(two, "").generator as { params: Record<string, unknown> }).params.secondChancePlaces).toBeUndefined();
      expect(FormatTemplateSchema.safeParse(two).success).toBe(true);
    });

    it("the preview follows: 14 riders, target 3, minimum 3 → 3/3/4/4; 13 riders, target 4, minimum 4 → 4/4/5", () => {
      const a = previewFormat(parseFormatTemplate(withMinRiders(withHeatTarget(knock(), 3), 3)), 14);
      expect(a.ladder[0].heats.map((h) => h.size)).toEqual([3, 3, 4, 4]);
      const b = previewFormat(parseFormatTemplate(withMinRiders(knock(), 4)), 13);
      expect(b.ladder[0].heats.map((h) => h.size)).toEqual([4, 4, 5]);
    });

    it("works for second-chance and pools (first round)", () => {
      const s = previewFormat(parseFormatTemplate(withMinRiders(withHeatTarget(withLadderKind(knock(), "second_chance"), 3), 3)), 14);
      expect(s.ladder[0].heats.map((h) => h.size)).toEqual([3, 3, 4, 4]);
      const p = previewFormat(parseFormatTemplate(withMinRiders(withHeatTarget(withLadderKind(knock(), "pools"), 8), 6)), 23);
      expect(p.ladder[0].heats.map((h) => h.size)).toEqual([7, 8, 8]);
    });
  });
});
