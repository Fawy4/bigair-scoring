import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext (where to go after signing in)", () => {
  it("keeps normal in-app paths, with query strings", () => {
    expect(safeNext("/org")).toBe("/org");
    expect(safeNext("/org/events/123?tab=riders")).toBe("/org/events/123?tab=riders");
  });
  it("falls back when empty or missing", () => {
    expect(safeNext(null)).toBe("/org");
    expect(safeNext("")).toBe("/org");
    expect(safeNext(undefined, "/seat")).toBe("/seat");
  });
  it("refuses anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "/%2F%2Fevil.example", "/ok\nSet-Cookie: x=1", "/\t/evil.example"]) {
      expect(safeNext(bad), bad).toBe("/org");
    }
  });
});
