import { describe, expect, it } from "vitest";
import { NO_REASON, reasonOf } from "./reason";

describe("reasons are optional (Polish 3, item 2)", () => {
  it("keeps what was typed, trimmed", () => {
    expect(reasonOf("  kite tangle ")).toBe("kite tangle");
  });
  it("records 'no reason given' when nothing was typed", () => {
    expect(NO_REASON).toBe("no reason given");
    for (const v of ["", "   ", "\n", undefined, null]) expect(reasonOf(v)).toBe("no reason given");
  });
  it("is long enough for the database's own minimum, so an empty box is accepted everywhere", () => {
    expect(NO_REASON.length).toBeGreaterThanOrEqual(5);
  });
  it("a one- or two-letter reason is kept as typed (nothing is refused any more)", () => {
    expect(reasonOf("ok")).toBe("ok");
  });
});
