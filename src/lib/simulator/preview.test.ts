import { describe, expect, it } from "vitest";
import { previewMatches } from "./preview";

describe("the simulation preview cookie", () => {
  const value = "demo-cup-sim-ab12c:11111111-1111-4111-8111-111111111111";
  it("matches the event it names, by slug or by id", () => {
    expect(previewMatches(value, { slug: "demo-cup-sim-ab12c" })).toBe(true);
    expect(previewMatches(value, { slug: "Demo-Cup-Sim-AB12C" })).toBe(true);
    expect(previewMatches(value, { eventId: "11111111-1111-4111-8111-111111111111" })).toBe(true);
  });
  it("never matches another event", () => {
    expect(previewMatches(value, { slug: "arrow-big-air" })).toBe(false);
    expect(previewMatches(value, { eventId: "22222222-2222-4222-8222-222222222222" })).toBe(false);
    expect(previewMatches(value, {})).toBe(false);
  });
  it("an empty or damaged cookie matches nothing", () => {
    expect(previewMatches(undefined, { slug: "x" })).toBe(false);
    expect(previewMatches("", { slug: "x" })).toBe(false);
    expect(previewMatches("justaslug", { slug: "justaslug" })).toBe(false);
  });
});
