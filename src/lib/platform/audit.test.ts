import { describe, expect, it } from "vitest";
import { auditDetails, auditLabel } from "./audit";

describe("audit log wording", () => {
  it("names known actions in plain words and falls back to a readable version of unknown ones", () => {
    expect(auditLabel("impersonation_started")).toBe("Started viewing as organiser");
    expect(auditLabel("preset_published")).toBe("Preset published to all customers");
    expect(auditLabel("something_new_happened")).toBe("something new happened");
    expect(auditLabel("insert")).toBe("insert");
  });
  it("shows what changed for renames, presets, organisers and reasons", () => {
    expect(auditDetails({ action: "organisation_renamed", before: { name: "Old" }, after: { name: "New" }, reason: null })).toBe("“Old” → “New”");
    expect(auditDetails({ action: "preset_published", before: null, after: { key: "kota", version: 3 }, reason: null })).toBe("kota, version 3");
    expect(auditDetails({ action: "organiser_added", before: null, after: { user_id: "u", role: "owner" }, reason: null })).toBe("role: owner");
    expect(auditDetails({ action: "impersonation_started", before: null, after: { slug: "arrow", name: "Arrow" }, reason: "support call" })).toBe("Reason: support call");
    expect(auditDetails({ action: "organisation_created", before: null, after: { name: "Arrow" }, reason: null })).toBe("");
  });
});
