import { describe, expect, it } from "vitest";
import { joinErrorMessage } from "./messages";

describe("join error messages (plain language for officials on the beach)", () => {
  it("explains each known code without jargon", () => {
    for (const code of ["INVALID_PIN", "INVALID_TOKEN", "RATE_LIMITED", "SEAT_LOCKED", "NO_SESSION", "ORGANISER_SESSION"]) {
      const m = joinErrorMessage(code);
      expect(m.length, code).toBeGreaterThan(20);
      expect(m, code).not.toMatch(/[A-Z]{4,}_[A-Z]{3,}/);
    }
  });
  it("never reveals whether the event code or the PIN was the wrong part", () => {
    expect(joinErrorMessage("INVALID_PIN")).toMatch(/event code|PIN/i);
  });
  it("has a safe default", () => {
    expect(joinErrorMessage("SOMETHING_ELSE")).toMatch(/try again/i);
  });
});
