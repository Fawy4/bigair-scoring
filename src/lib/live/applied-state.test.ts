import { describe, expect, it } from "vitest";
import { replaceHeatSlots } from "./applied-state";
import type { SlotRow } from "./types";

const slot = (id: string, heat: string, position: number, modifier: string | null = null) => ({ id, heat_id: heat, position, entry_id: `e${position}`, vest_colour: null, modifier, flagged_out: false, updated_at: "2026-01-01T00:00:00Z" }) as unknown as SlotRow;

describe("what the server says after a press goes on the screen at once", () => {
  it("replaces the seats of that heat and leaves every other heat alone", () => {
    const now = [slot("a", "h1", 1), slot("b", "h1", 2), slot("c", "h2", 1)];
    const next = replaceHeatSlots(now, "h1", [slot("a", "h1", 1), slot("b", "h1", 2, "DNS")]);
    expect(next.find((s) => s.id === "b")?.modifier).toBe("DNS");
    expect(next.find((s) => s.id === "c")).toBe(now[2]);
    expect(next).toHaveLength(3);
  });
  it("an empty answer clears nothing it was not given", () => {
    const now = [slot("a", "h1", 1)];
    expect(replaceHeatSlots(now, "h1", [])).toEqual([]);
  });
});
