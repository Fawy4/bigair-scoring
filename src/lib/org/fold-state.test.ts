import { describe, expect, it } from "vitest";
import { foldInitial, foldKey, foldSaved } from "./fold-state";

describe("folded section cards (Polish 3, item 11)", () => {
  it("the first card of a page starts open, the others folded", () => {
    expect(foldInitial(null, true)).toBe(true);
    expect(foldInitial(null, false)).toBe(false);
  });
  it("a remembered choice wins over the default, both ways", () => {
    expect(foldInitial("closed", true)).toBe(false);
    expect(foldInitial("open", false)).toBe(true);
  });
  it("anything stored that is not 'open' or 'closed' is ignored", () => {
    expect(foldSaved("open")).toBe("open");
    expect(foldSaved("closed")).toBe("closed");
    for (const junk of ["", "yes", "true", null, undefined]) expect(foldSaved(junk)).toBeNull();
  });
  it("each card has its own key", () => {
    expect(foldKey("branding")).not.toBe(foldKey("flags"));
  });
});
