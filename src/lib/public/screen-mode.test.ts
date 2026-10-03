import { describe, expect, it } from "vitest";
import { otherMode, parseScreenMode, SCREEN_CONTROL_MS } from "./screen-mode";

describe("the big screen's colour mode (Polish 2b, item 3)", () => {
  it("a remembered choice wins over the event's default; anything else falls back to the default", () => {
    expect(parseScreenMode("day", "dark")).toBe("day");
    expect(parseScreenMode("dark", "day")).toBe("dark");
    expect(parseScreenMode(null, "day")).toBe("day");
    expect(parseScreenMode("blue", "dark")).toBe("dark");
  });
  it("the key D flips between the two; the control hides after three seconds", () => {
    expect(otherMode("dark")).toBe("day");
    expect(otherMode("day")).toBe("dark");
    expect(SCREEN_CONTROL_MS).toBe(3000);
  });
});
