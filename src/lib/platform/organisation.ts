import { copy } from "@/lib/ui-copy";

/** The confirmation for deleting an organisation: the exact slug, ignoring capitals and spaces around it. */
export function slugMatches(slug: string, typed: string): boolean {
  return slug.length > 0 && typed.trim().toLowerCase() === slug.toLowerCase();
}

/** A plain-language reason why the organisation cannot be deleted, or null when it can. Published results are permanent. */
export function deleteBlockedReason(publishedResults: number): string | null {
  return publishedResults > 0 ? copy.admin.org.deleteBlocked(publishedResults) : null;
}

export function organisationStatus(archivedAt: string | null | undefined): "active" | "archived" {
  return archivedAt ? "archived" : "active";
}

/** The link that signs an invited organiser in without an inbox (the same route the email link uses). */
export function inviteConfirmLink(siteUrl: string, hashedToken: string): string {
  const url = new URL("/auth/confirm", siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`);
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("next", "/org");
  return url.toString();
}

/**
 * Web addresses that tests and scripts create organisations with. The database marks such an organisation as test the moment it is created (trigger
 * label_test_organisation, migration 20261113100000, which holds the same pattern; a unit test keeps the two equal). Every test also sets the label itself.
 */
export const TEST_SLUG_PATTERN = /^(e2e|rls|plat|evdel|p4|reset)-/;

export function isTestData(slug: string): boolean {
  return TEST_SLUG_PATTERN.test(slug);
}

/** The Organisations list: test organisations are left out unless the owner switched "Show test organisations" on. Nothing else about the rows changes. */
export function listedOrganisations<T extends { is_test: boolean }>(rows: T[], showTest: boolean): T[] {
  return showTest ? rows : rows.filter((o) => !o.is_test);
}

/** The "Create demo organisation" button is offered only while no demo organisation exists, counted over ALL organisations, marked as test or not. */
export function demoOrganisationMissing(rows: Array<{ slug: string }>): boolean {
  return !rows.some((o) => o.slug === "demo" || o.slug === "demo-org");
}

/** Why an event cannot be deleted (published results are permanent), or null when it can. */
export function eventDeleteBlockedReason(publishedResults: number): string | null {
  return publishedResults > 0 ? copy.eventLifecycle.deleteBlocked(publishedResults) : null;
}
