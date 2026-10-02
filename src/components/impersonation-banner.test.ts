import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { copy } from "@/lib/ui-copy";

// Phase 7a-2, step 2: while a platform owner is inside an organisation the screen shows a slim muted strip with the organisation name and a quiet
// "Back to admin" link: no yellow block, no thick black rule, no big bold type.
const src = readFileSync("src/components/impersonation-banner.tsx", "utf8");

describe("impersonation banner", () => {
  it("says who you are viewing as, and offers a quiet way back, in the owner's words", () => {
    expect(copy.layout.viewingAs).toBe("Viewing as");
    expect(copy.layout.backToAdmin).toBe("Back to admin");
  });
  it("is still the status strip with the form that ends the impersonation", () => {
    expect(src).toContain('role="status"');
    expect(src).toContain("stopImpersonation");
    expect(src).toContain('type="submit"');
  });
  it("is a muted strip: surface colour, 1 px line, small type; no yellow, no thick rule, no hard-coded colour, no heavy weight", () => {
    expect(src).toMatch(/bg-beach-surface/);
    expect(src).toMatch(/border-b border-beach-line/);
    expect(src).toMatch(/text-small/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}|yellow|border-b-[2-9]|border-4|font-(bold|extrabold|black)|text-(lg|xl|2xl)/);
  });
  it("the way back is a quiet link (underlined text, no fill) that still has the control height", () => {
    expect(src).toMatch(/underline/);
    expect(src).toMatch(/min-h-\[var\(--org-ctl\)\]/);
    expect(src).not.toMatch(/\bbtn\b|bg-white|bg-beach-accent/);
  });
});
