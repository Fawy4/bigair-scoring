import { describe, expect, it } from "vitest";
import { formatClock } from "./timer";

// docs/PLAN-phase-5 step 1 test values (5b adds the clock maths; 5a only needs the way a time is written).
describe("formatClock", () => {
  it("330 s is 5:30", () => expect(formatClock(330_000)).toBe("5:30"));
  it("420 s is 7:00", () => expect(formatClock(420_000)).toBe("7:00"));
  it("time up is 0:00", () => expect(formatClock(0)).toBe("0:00"));
  it("a full 10 minute heat is 10:00", () => expect(formatClock(600_000)).toBe("10:00"));
  it("a part second rounds up, so 0:00 only shows when time is really up", () => {
    expect(formatClock(59_001)).toBe("1:00");
    expect(formatClock(1)).toBe("0:01");
  });
  it("never negative", () => expect(formatClock(-5000)).toBe("0:00"));
});
