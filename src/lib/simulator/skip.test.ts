import { describe, expect, it } from "vitest";
import { skipRefusal } from "./skip";

const heat = (status: string, armed = false) => ({ status, armed });

describe("Skip to end of heat: when it cannot act", () => {
  it("acts on a running heat while the auto-play is playing", () => {
    expect(skipRefusal({ state: "playing", heats: [heat("running"), heat("scheduled")] })).toBeNull();
  });
  it("acts on a running heat even when the auto-play is stopped (the heat was started by hand)", () => {
    expect(skipRefusal({ state: "stopped", heats: [heat("running")] })).toBeNull();
  });
  it("refuses while the auto-play is paused", () => {
    expect(skipRefusal({ state: "paused", heats: [heat("running")] })).toBe("paused");
    expect(skipRefusal({ state: "paused", heats: [heat("paused")] })).toBe("paused");
  });
  it("refuses a heat that is paused on the water", () => {
    expect(skipRefusal({ state: "playing", heats: [heat("paused")] })).toBe("paused");
  });
  it("refuses a heat still in its yellow", () => {
    expect(skipRefusal({ state: "playing", heats: [heat("scheduled", true)] })).toBe("inYellow");
  });
  it("refuses when no heat is on the water", () => {
    expect(skipRefusal({ state: "playing", heats: [heat("scheduled"), heat("published")] })).toBe("noHeat");
    expect(skipRefusal({ state: "playing", heats: [heat("under_review")] })).toBe("noHeat");
    expect(skipRefusal({ state: "playing", heats: [] })).toBe("noHeat");
  });
});
