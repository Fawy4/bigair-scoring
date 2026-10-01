import { describe, expect, it } from "vitest";
import vocabularyJson from "../../../presets/tricks/big-air-vocabulary.json";
import { builtInSchemes } from "@/lib/schemas/identification";
import { attemptCounts, feedLines, ridersForHeat, trickKit } from "./screen-model";
import type { AttemptRow, SlotRow } from "./types";

const lycra = builtInSchemes().find((s) => s.id === "vests-per-heat")!;
const slot = (position: number, entry: string | null, colour: string, patch: Partial<SlotRow> = {}): SlotRow => ({ id: `s${position}`, heat_id: "h", position, entry_id: entry, vest_colour: colour, modifier: null, flagged_out: false, updated_at: "", ...patch });
const attempt = (id: string, entry: string, seq: number, patch: Partial<AttemptRow> = {}): AttemptRow => ({
  id, heat_id: "h", entry_id: entry, seq, client_key: `k-${id}`, direction: "left", category_key: null, trick_name: "Left Backroll", trick_parts: {}, status: "landed",
  created_by_seat: null, created_at: `2026-10-01T10:00:0${seq}.000Z`, deleted_at: null, possible_duplicate_of: null, input_method: "builder", raw_text: null, updated_at: "", ...patch,
});
const pend = (key: string, entry: string) => ({ clientKey: key, entryId: entry, heatId: "h", status: "landed" as const, trickName: "Left Frontroll", direction: "left" as const, needsReview: false, createdAt: Date.parse("2026-10-01T10:00:09.000Z") });

describe("the riders of a heat", () => {
  const ctx = { riders: [{ entryId: "e1", divisionId: "d", name: "Sam Rivera", nationality: "EG" }, { entryId: "e2", divisionId: "d", name: "Noor Haddad" }] };
  it("come in seat order with the label the scheme gives them: the Lycra colour is the seat's, the name is always there", () => {
    const riders = ridersForHeat(ctx, { scheme: lycra }, [slot(2, "e2", "blue"), slot(1, "e1", "red"), slot(3, null, "yellow")]);
    expect(riders.map((r) => [r.entryId, r.label.primary.text])).toEqual([["e1", "RED"], ["e2", "BLUE"]]);
    expect(riders[0].label.secondary.some((x) => x.text === "Sam Rivera")).toBe(true);
  });
  it("a rider who did not start or was flagged out is not riding", () => {
    const riders = ridersForHeat(ctx, { scheme: lycra }, [slot(1, "e1", "red", { modifier: "DNS" }), slot(2, "e2", "blue", { flagged_out: true })]);
    expect(riders.map((r) => r.riding)).toEqual([false, false]);
  });
});

describe("attempts used", () => {
  it("count the saved ones that are not deleted plus those waiting on the phone, and never twice", () => {
    const saved = [attempt("a1", "e1", 1), attempt("a2", "e1", 2, { deleted_at: "2026-10-01T10:01:00Z" }), attempt("a3", "e2", 3)];
    const counts = attemptCounts(saved, [pend("k-a3", "e2"), pend("k-new", "e1")]);
    expect(counts.get("e1")).toBe(2);
    expect(counts.get("e2")).toBe(1);
  });
});

describe("the spotter's feed", () => {
  it("lists saved and waiting attempts, newest first; a waiting one has no number yet", () => {
    const lines = feedLines([attempt("a1", "e1", 1), attempt("a2", "e1", 2, { possible_duplicate_of: "a1" })], [pend("k-new", "e1")]);
    expect(lines.map((l) => [l.seq, l.pending, l.duplicate])).toEqual([[null, true, false], [2, false, true], [1, false, false]]);
  });
});

describe("the trick kit", () => {
  it("builds the vocabulary and each division's layout; unticked blocks are left out", () => {
    const kit = trickKit({ vocabulary: vocabularyJson as never, localBlocks: [] })!;
    expect(kit.vocab.blocks.length).toBeGreaterThan(30);
    const view = kit.viewFor({ trickBase: { disabled: ["base:backroll"], layout: null } } as never);
    expect(view.find((v) => v.family === "base")!.blocks.map((b) => b.key)).not.toContain("backroll");
    expect(trickKit({ vocabulary: null, localBlocks: [] })).toBeNull();
  });
});
