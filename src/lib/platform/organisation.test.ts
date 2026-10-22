import { describe, expect, it } from "vitest";
import { deleteBlockedReason, demoOrganisationMissing, eventDeleteBlockedReason, inviteConfirmLink, isTestData, listedOrganisations, organisationStatus, slugMatches } from "./organisation";

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
    expect(isTestData("p4-a-1f2e")).toBe(true);
    expect(isTestData("reset-x-1f2e")).toBe(true);
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

describe("the Organisations list and test organisations (CL1)", () => {
  const rows = [
    { slug: "arrow", is_test: false },
    { slug: "redbull", is_test: false },
    { slug: "ekl", is_test: false },
    { slug: "demo-org", is_test: true },
    { slug: "rls-a-f2156156", is_test: true },
    { slug: "e2e-06b4f0aa", is_test: true },
  ];
  it("shows only Arrow, Redbull and EKL by default, in the same order", () => {
    expect(listedOrganisations(rows, false).map((o) => o.slug)).toEqual(["arrow", "redbull", "ekl"]);
  });
  it("the Show test organisations switch brings every row back, unchanged", () => {
    expect(listedOrganisations(rows, true)).toEqual(rows);
  });
  it("hides nothing that is not marked as test, whatever its web address looks like", () => {
    expect(listedOrganisations([{ slug: "rls-looking-but-real", is_test: false }], false)).toHaveLength(1);
  });
  it("the Create demo organisation button stays away while a demo exists, even one that is marked as test and hidden from the list", () => {
    expect(demoOrganisationMissing(rows)).toBe(false);
    const visibleOnly = listedOrganisations(rows, false);
    expect(demoOrganisationMissing(visibleOnly)).toBe(true); // the trap: counting only what is listed would offer a second demo
    expect(demoOrganisationMissing([{ slug: "demo" }])).toBe(false);
    expect(demoOrganisationMissing([{ slug: "arrow" }])).toBe(true);
  });
  it("the admin page decides about the button from the full list, not the shown one", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("src/app/admin/page.tsx", "utf8");
    expect(page).toContain("demoOrganisationMissing(all)");
    expect(page).toContain("listedOrganisations(all, showTest)");
  });
});
