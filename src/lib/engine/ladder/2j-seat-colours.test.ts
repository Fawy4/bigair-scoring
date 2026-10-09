// Seat colours follow the EVENT's colour list, in the organiser's order (not the format's built-in list).
import { describe, expect, it } from "vitest";
import type { FormatTemplate } from "@/lib/schemas/format-template";
import { applyDrawEdit } from "./draw-edit";
import { expandFormat } from "./expand";
import { heat, loadFormat, makeEntrants, publish, publishRound, round } from "./fixtures";

const RBW = ["red", "black", "white"];
const params = { heatSize: 3, minHeatSize: 3, maxHeatSize: 3, advancePerHeat: 1, finalSize: 2 };
const knock = (): FormatTemplate => loadFormat("heats4-top2-single-elim", (j) => Object.assign(j.generator.params, params));
const colours = (d: ReturnType<typeof expandFormat>, r: string) => round(d, r).heats.map((h) => h.slots.map((s) => s.vestColour));

describe("2J seat colours come from the event's list", () => {
  const draw = expandFormat(knock(), makeEntrants(12), { identification: "vests-per-heat", vestColours: RBW });

  it("a 12-rider division at 3 per heat: every Round 1 heat is red, black, white in seat order", () => {
    const r1 = colours(draw, "R1");
    expect(r1).toHaveLength(4);
    for (const h of r1) expect(h).toEqual(RBW);
  });

  it("without an event list the format's own list still applies (older draws)", () => {
    const old = expandFormat(knock(), makeEntrants(12), { identification: "vests-per-heat" });
    expect(colours(old, "R1")[0]).toEqual(["red", "yellow", "blue"]);
  });

  it("a rider moved by hand takes the colour of the seat he lands in", () => {
    const from = { heatId: "R1-H1", slot: 0 };
    const to = { heatId: "R1-H2", slot: 2 };
    const moved = applyDrawEdit(draw, { op: "move", from, to }).draw;
    const landed = heat(moved, "R1-H2").slots[2];
    expect(landed.vestColour).toBe("white");
    expect(heat(moved, "R1-H1").slots[0].vestColour).toBe("red");
    for (const h of colours(moved, "R1")) expect(h).toEqual(RBW);
  });

  it("later rounds get the same colours, while seats wait and once they fill", () => {
    for (const h of colours(draw, "SF")) expect(h.every((c) => RBW.includes(c!))).toBe(true);
    const half = publish(draw, "R1-H1");
    for (const h of colours(half, "SF")) expect(h.every((c) => RBW.includes(c!))).toBe(true);
    const full = publishRound(draw, "R1");
    for (const h of colours(full, "SF")) expect(h).toEqual(RBW.slice(0, h.length));
    expect(round(full, "SF").heats.every((h) => h.slots.every((s) => s.entrantId))).toBe(true);
    for (const h of colours(full, "F")) expect(h).toEqual(RBW.slice(0, h.length));
  });
});
