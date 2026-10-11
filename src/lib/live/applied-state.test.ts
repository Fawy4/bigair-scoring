import { describe, expect, it } from "vitest";
import { mergeFresh, replaceHeatSlots } from "./applied-state";
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

describe("a refresh that arrives late never puts an older row over a newer one", () => {
  const row = (id: string, status: string, updated_at: string | null) => ({ id, status, updated_at });
  it("keeps the row the screen already has when it is newer than the one that arrived", () => {
    const now = [row("a", "published", "2026-10-11T18:29:25.983697+00:00"), row("b", "scheduled", "2026-10-11T18:00:00+00:00")];
    const late = [row("a", "scheduled", "2026-10-11T18:29:24.829447+00:00"), row("b", "scheduled", "2026-10-11T18:00:00+00:00")];
    expect(mergeFresh(now, late).find((r) => r.id === "a")?.status).toBe("published");
  });
  it("takes the arrived row when it is newer or the same age, and rows the screen did not have", () => {
    const now = [row("a", "scheduled", "2026-10-11T18:00:00+00:00")];
    const fresh = [row("a", "published", "2026-10-11T18:05:00+00:00"), row("c", "scheduled", "2026-10-11T18:06:00+00:00")];
    const out = mergeFresh(now, fresh);
    expect(out.map((r) => [r.id, r.status])).toEqual([["a", "published"], ["c", "scheduled"]]);
    expect(mergeFresh([row("a", "x", "2026-10-11T18:00:00+00:00")], [row("a", "y", "2026-10-11T18:00:00+00:00")])[0].status).toBe("y");
  });
  it("a row with no time on either side is taken as arrived (a guess on the screen is replaced by the server's row)", () => {
    expect(mergeFresh([row("a", "guess", null)], [row("a", "server", "2026-10-11T18:00:00+00:00")])[0].status).toBe("server");
  });
  it("a row the server no longer has is dropped", () => {
    expect(mergeFresh([row("a", "x", null), row("gone", "x", null)], [row("a", "x", null)]).map((r) => r.id)).toEqual(["a"]);
  });
  it("compares moments, not text (fractions of different length)", () => {
    expect(mergeFresh([row("a", "now", "2026-10-11T18:29:25.5+00:00")], [row("a", "late", "2026-10-11T18:29:25.123456+00:00")])[0].status).toBe("now");
  });
});
