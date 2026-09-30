import { describe, expect, it } from "vitest";
import { deleteBlockedReason, inviteConfirmLink, organisationStatus, slugMatches } from "./organisation";

describe("deleting an organisation", () => {
  it("needs the exact slug typed (spaces around it and capitals do not matter)", () => {
    expect(slugMatches("arrow", "arrow")).toBe(true);
    expect(slugMatches("arrow", "  Arrow ")).toBe(true);
    expect(slugMatches("arrow", "arro")).toBe(false);
    expect(slugMatches("arrow", "")).toBe(false);
    expect(slugMatches("", "")).toBe(false);
  });
  it("is blocked as soon as any result was published", () => {
    expect(deleteBlockedReason(0)).toBeNull();
    expect(deleteBlockedReason(1)).toMatch(/published results/i);
    expect(deleteBlockedReason(12)).toMatch(/12/);
  });
});

describe("organisation status", () => {
  it("is Archived when there is an archive date, else Active", () => {
    expect(organisationStatus(null)).toBe("active");
    expect(organisationStatus("2026-10-01T10:00:00Z")).toBe("archived");
  });
});

describe("the copyable sign-in link", () => {
  it("points at the confirm route with the token and where to land", () => {
    const url = new URL(inviteConfirmLink("https://app.example.com/", "abc123"));
    expect(url.origin + url.pathname).toBe("https://app.example.com/auth/confirm");
    expect(url.searchParams.get("token_hash")).toBe("abc123");
    expect(url.searchParams.get("type")).toBe("magiclink");
    expect(url.searchParams.get("next")).toBe("/org");
  });
});
