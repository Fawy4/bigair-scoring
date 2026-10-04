import { describe, expect, it } from "vitest";
import { needsHardNavigation } from "./hard-navigation";

describe("pages whose links go through the browser (Polish 3, item 4)", () => {
  it("is the simulator page and nothing else", () => {
    const id = "ec34bcb3-b1e2-4d6a-ba76-55f02dddd9fb";
    expect(needsHardNavigation(`/org/events/${id}/simulate`)).toBe(true);
    expect(needsHardNavigation(`/org/events/${id}/simulate/`)).toBe(true);
    for (const other of ["draw", "riders", "event", "schedule", "officials", "divisions", ""]) expect(needsHardNavigation(`/org/events/${id}/${other}`)).toBe(false);
    expect(needsHardNavigation("/org")).toBe(false);
    expect(needsHardNavigation(`/org/events/${id}/simulate/leave`)).toBe(false);
  });
});
