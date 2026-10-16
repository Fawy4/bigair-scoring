// RB1 — the head judge console (and every live screen) lets a platform admin in only through an open "Open as this organiser" session for that very organisation.
import { describe, expect, it } from "vitest";
import { impersonatesOrg } from "./session";

const session = (organisationId: string, expiresAt: string) => ({ organisationId, name: "x", slug: "x", expiresAt });
const now = Date.parse("2026-10-16T10:00:00Z");

describe("impersonatesOrg", () => {
  it("is true for the organisation of an open session", () => expect(impersonatesOrg(session("a", "2026-10-16T11:00:00Z"), "a", now)).toBe(true));
  it("is false for another organisation", () => expect(impersonatesOrg(session("a", "2026-10-16T11:00:00Z"), "b", now)).toBe(false));
  it("is false once the session has run out", () => expect(impersonatesOrg(session("a", "2026-10-16T09:00:00Z"), "a", now)).toBe(false));
  it("is false with no session", () => expect(impersonatesOrg(null, "a", now)).toBe(false));
});
