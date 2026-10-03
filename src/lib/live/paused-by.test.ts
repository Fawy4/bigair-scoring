import { describe, expect, it } from "vitest";
import { pausedByWords } from "./paused-by";

// Polish 2, item 3: the console says who paused the heat when it was the simulator.
describe("Paused by the simulator", () => {
  it("a heat the simulator paused", () => {
    expect(pausedByWords({ status: "paused", paused_reason: "simulator" })).toBe("Paused by the simulator");
  });
  it("the head judge's own pause, a running heat, no heat: nothing extra", () => {
    expect(pausedByWords({ status: "paused", paused_reason: null })).toBeNull();
    expect(pausedByWords({ status: "running", paused_reason: "simulator" })).toBeNull();
    expect(pausedByWords(null)).toBeNull();
  });
});
