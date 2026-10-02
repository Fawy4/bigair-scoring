import { describe, expect, it } from "vitest";
import { eventCodeToPath } from "./event-code";

// The landing page's "Have an event code?" field: the code is the event's web address ending (its slug). People paste all sorts of things.
describe("event code to page", () => {
  it("a plain code goes to the event page, lower case", () => {
    expect(eventCodeToPath("arrow-launch-2026")).toBe("/e/arrow-launch-2026");
    expect(eventCodeToPath("  Arrow-Launch-2026 ")).toBe("/e/arrow-launch-2026");
  });
  it("a pasted address or path is reduced to the code", () => {
    expect(eventCodeToPath("https://bigair.example.com/e/arrow-launch-2026/live")).toBe("/e/arrow-launch-2026");
    expect(eventCodeToPath("/e/arrow-launch-2026")).toBe("/e/arrow-launch-2026");
    expect(eventCodeToPath("e/arrow-launch-2026/")).toBe("/e/arrow-launch-2026");
  });
  it("nothing usable gives null, so the form stays where it is", () => {
    expect(eventCodeToPath("")).toBeNull();
    expect(eventCodeToPath("   ")).toBeNull();
    expect(eventCodeToPath("../admin")).toBeNull();
    expect(eventCodeToPath("a b")).toBeNull();
    expect(eventCodeToPath("é")).toBeNull();
  });
});
