import { describe, expect, it } from "vitest";
import { windCallText } from "./wind-text";

describe("the wind-call banner words", () => {
  it("a message is shown alone after the label", () => {
    expect(windCallText({ status: "amber", message: "Light wind: heats on hold" })).toBe("Wind Call: Light wind: heats on hold");
    expect(windCallText({ status: "green", message: "  Good to go " })).toBe("Wind Call: Good to go");
  });
  it("no message: the state word that matches the colour", () => {
    expect(windCallText({ status: "red", message: null })).toBe("Wind Call: Stop");
    expect(windCallText({ status: "amber", message: null })).toBe("Wind Call: Hold");
    expect(windCallText({ status: "green", message: null })).toBe("Wind Call: LETS GO!");
  });
  it("a blank message counts as none", () => {
    expect(windCallText({ status: "red", message: "   " })).toBe("Wind Call: Stop");
  });
});
