import { describe, expect, it } from "vitest";
import { deleteBlockedReason, eventDeleteBlockedReason, inviteConfirmLink, isTestData, organisationStatus, slugMatches } from "./organisation";

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

describe("test data", () => {
  it("organisations whose web address starts with e2e- are flagged as test data", () => {
    expect(isTestData("e2e-06b4f0aa")).toBe(true);
    expect(isTestData("e2e-new-abc")).toBe(true);
    expect(isTestData("rls-a-1f2e")).toBe(true);
    expect(isTestData("plat-c-1f2e")).toBe(true);
    expect(isTestData("evdel-x-1f2e")).toBe(true);
    expect(isTestData("arrow")).toBe(false);
    expect(isTestData("demo-org")).toBe(false);
    expect(isTestData("the-e2e-club")).toBe(false);
    expect(isTestData("")).toBe(false);
  });
});

describe("deleting an event", () => {
  it("is blocked, with the way out named, once any result is published", () => {
    expect(eventDeleteBlockedReason(0)).toBeNull();
    expect(eventDeleteBlockedReason(3)).toMatch(/published results/i);
    expect(eventDeleteBlockedReason(3)).toMatch(/archive/i);
  });
});
