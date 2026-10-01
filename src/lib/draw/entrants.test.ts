import { describe, expect, it } from "vitest";
import { expandFormat } from "@/lib/engine/ladder";
import { loadFormat } from "@/lib/engine/ladder/fixtures";
import { applyHeatStatuses, confirmedEntrants, engineSchemeId, heatStatusFromDb, syncEntrants, type EntryInput } from "./entrants";

const entry = (id: string, seed: number | null, status = "confirmed", extra: Partial<EntryInput> = {}): EntryInput => ({ id, seed, status, name: `Rider ${id}`, ...extra });

describe("who takes part in the draw", () => {
  it("only confirmed riders, in seed order; withdrawn, no-show and still-registered riders are left out", () => {
    const list = confirmedEntrants([entry("c", 3), entry("a", 1), entry("w", 2, "withdrawn"), entry("n", 4, "no_show"), entry("r", 5, "registered"), entry("b", 2)]);
    expect(list.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("riders without a seed come last, in the order they were entered", () => {
    const list = confirmedEntrants([entry("x", null, "confirmed", { createdAt: "2026-01-02" }), entry("y", null, "confirmed", { createdAt: "2026-01-01" }), entry("a", 1)]);
    expect(list.map((e) => e.id)).toEqual(["a", "y", "x"]);
  });

  it("identifiers travel with the rider", () => {
    const [e] = confirmedEntrants([entry("a", 1, "confirmed", { identifiers: { bib: "14" } })]);
    expect(e.identifiers).toEqual({ bib: "14" });
  });
});

describe("the engine's scheme for an organisation's own scheme", () => {
  const s = (over: object) => ({ id: "custom", primary: "name" as const, vestAssignment: "none" as const, ...over });
  it("built-in ids are used as they are; own schemes map by how they behave", () => {
    expect(engineSchemeId(s({ id: "bib-numbers" }))).toBe("bib-numbers");
    expect(engineSchemeId(s({ vestAssignment: "per_heat_slot" }))).toBe("vests-per-heat");
    expect(engineSchemeId(s({ vestAssignment: "fixed_per_rider" }))).toBe("fixed-lycra-per-rider");
    expect(engineSchemeId(s({ primary: "bib_number" }))).toBe("bib-numbers");
    expect(engineSchemeId(s({ primary: "kite" }))).toBe("kites-no-vests");
    expect(engineSchemeId(s({}))).toBe("name-callout");
  });
});

describe("keeping a stored draw in line with the Riders step", () => {
  const draw = () => expandFormat(loadFormat("single-final"), confirmedEntrants([entry("a", 1), entry("b", 2), entry("c", 3)]), { identification: "name-callout" });

  it("a rider confirmed after the draw is added (so she can be placed by hand); a rider who is no longer confirmed is flagged, nobody is moved", () => {
    const synced = syncEntrants(draw(), [entry("a", 1), entry("b", 2, "withdrawn"), entry("c", 3), entry("d", 4)]);
    expect(synced.entrants.map((e) => [e.id, Boolean(e.withdrawn)])).toEqual([["a", false], ["b", true], ["c", false], ["d", false]]);
    expect(synced.seedOrder).toEqual(["a", "b", "c", "d"]);
    expect(synced.rounds[0].heats[0].slots.map((s) => s.entrantId)).toEqual(draw().rounds[0].heats[0].slots.map((s) => s.entrantId));
  });

  it("a rider who has no entry any more counts as withdrawn", () => {
    expect(syncEntrants(draw(), [entry("a", 1), entry("b", 2)]).entrants.find((e) => e.id === "c")?.withdrawn).toBe(true);
  });
});

describe("heat status from the database", () => {
  it("scheduled heats have not started; everything else has", () => {
    expect(heatStatusFromDb("scheduled")).toBe("pending");
    expect(heatStatusFromDb("running")).toBe("running");
    expect(heatStatusFromDb("paused")).toBe("running");
    expect(heatStatusFromDb("ended")).toBe("running");
    expect(heatStatusFromDb("published")).toBe("published");
  });

  it("the stored heat rows decide which heats of the draw have started", () => {
    const d = expandFormat(loadFormat("single-final"), confirmedEntrants([entry("a", 1), entry("b", 2)]), { identification: "name-callout" });
    d.rounds[0].heats[0].uid = "F-H1";
    expect(applyHeatStatuses(d, [{ draw_uid: "F-H1", status: "running" }]).rounds[0].heats[0].status).toBe("running");
    expect(applyHeatStatuses(d, [{ draw_uid: "other", status: "running" }]).rounds[0].heats[0].status).toBe("pending");
  });
});
